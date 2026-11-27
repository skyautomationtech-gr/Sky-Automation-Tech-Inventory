import {
  getDoc as rawGetDoc,
  getDocs as rawGetDocs,
  setDoc as rawSetDoc,
  updateDoc as rawUpdateDoc,
  addDoc as rawAddDoc,
  deleteDoc as rawDeleteDoc,
  onSnapshot as rawOnSnapshot,
  runTransaction as rawRunTransaction,
  writeBatch as rawWriteBatch,
  getCountFromServer as rawGetCountFromServer,
  DocumentReference,
  DocumentSnapshot,
  Query,
  QuerySnapshot,
  SetOptions,
  Transaction,
  WriteBatch,
  Unsubscribe,
  Firestore,
  CollectionReference,
  DocumentData,
  FirestoreError,
  SnapshotListenOptions,
} from 'firebase/firestore';
import {
  trackFirestoreRead,
  trackFirestoreWrite,
  trackListenerOpen,
} from '../utils/perfLogger';

const IS_DEV = import.meta.env.DEV;

function describeRefOrQuery(target: any): string {
  if (!target) return 'unknown';
  if (typeof target.path === 'string') return target.path;
  if (typeof target._query?.path?.canonicalString === 'function') {
    return target._query.path.canonicalString();
  }
  return 'query';
}

export async function getDoc<AppModelType = DocumentData, DbModelType extends DocumentData = DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>
): Promise<DocumentSnapshot<AppModelType, DbModelType>> {
  const snap = await rawGetDoc(reference);
  if (IS_DEV) {
    trackFirestoreRead('getDoc', describeRefOrQuery(reference), 1, Boolean(snap.metadata?.fromCache));
  }
  return snap;
}

export async function getDocs<AppModelType = DocumentData, DbModelType extends DocumentData = DocumentData>(
  queryRef: Query<AppModelType, DbModelType>
): Promise<QuerySnapshot<AppModelType, DbModelType>> {
  const snap = await rawGetDocs(queryRef);
  if (IS_DEV) {
    trackFirestoreRead(
      'getDocs',
      describeRefOrQuery(queryRef),
      snap.size,
      Boolean(snap.metadata?.fromCache)
    );
  }
  return snap;
}

export async function getCountFromServer(queryRef: Query<any, any>) {
  const snap = await rawGetCountFromServer(queryRef);
  if (IS_DEV) {
    trackFirestoreRead('getCountFromServer', describeRefOrQuery(queryRef), 1, false);
  }
  return snap;
}

export async function setDoc<AppModelType = DocumentData, DbModelType extends DocumentData = DocumentData>(
  reference: DocumentReference<AppModelType, DbModelType>,
  data: any,
  options?: SetOptions
): Promise<void> {
  if (IS_DEV) trackFirestoreWrite('setDoc', describeRefOrQuery(reference), 1);
  if (options) {
    return rawSetDoc(reference, data, options);
  }
  return rawSetDoc(reference, data);
}

export async function updateDoc(reference: DocumentReference<any, any>, data: any, ...more: any[]): Promise<void> {
  if (IS_DEV) trackFirestoreWrite('updateDoc', describeRefOrQuery(reference), 1);
  return (rawUpdateDoc as any)(reference, data, ...more);
}

export async function addDoc<AppModelType = DocumentData, DbModelType extends DocumentData = DocumentData>(
  reference: CollectionReference<AppModelType, DbModelType>,
  data: AppModelType
): Promise<DocumentReference<AppModelType, DbModelType>> {
  if (IS_DEV) trackFirestoreWrite('addDoc', describeRefOrQuery(reference), 1);
  return rawAddDoc(reference, data);
}

export async function deleteDoc(reference: DocumentReference<any, any>): Promise<void> {
  if (IS_DEV) trackFirestoreWrite('deleteDoc', describeRefOrQuery(reference), 1);
  return rawDeleteDoc(reference);
}

export function onSnapshot<AppModelType = DocumentData, DbModelType extends DocumentData = DocumentData>(
  target: any,
  onNextOrOptions: any,
  onErrorOrNext?: any,
  onCompletionOrError?: any
): Unsubscribe {
  if (!IS_DEV) {
    return (rawOnSnapshot as any)(target, onNextOrOptions, onErrorOrNext, onCompletionOrError);
  }

  const label = describeRefOrQuery(target);
  const closeListener = trackListenerOpen(label);

  let options: SnapshotListenOptions | undefined;
  let onNext: ((snap: any) => void) | undefined;
  let onError: ((err: FirestoreError) => void) | undefined;
  let onCompletion: (() => void) | undefined;

  if (typeof onNextOrOptions === 'function') {
    onNext = onNextOrOptions;
    onError = typeof onErrorOrNext === 'function' ? onErrorOrNext : undefined;
    onCompletion = typeof onCompletionOrError === 'function' ? onCompletionOrError : undefined;
  } else {
    options = onNextOrOptions;
    onNext = onErrorOrNext;
    onError = typeof onCompletionOrError === 'function' ? onCompletionOrError : undefined;
  }

  let isFirstSnapshot = true;
  const wrappedNext = (snap: any) => {
    if (snap) {
      const fromCache = Boolean(snap.metadata?.fromCache);
      if (typeof snap.size === 'number') {
        const count = isFirstSnapshot
          ? snap.size
          : typeof snap.docChanges === 'function'
            ? snap.docChanges().length
            : 1;
        if (count > 0 || isFirstSnapshot) {
          trackFirestoreRead(
            isFirstSnapshot ? 'onSnapshot:init' : 'onSnapshot:delta',
            label,
            count,
            fromCache
          );
        }
      } else {
        trackFirestoreRead(isFirstSnapshot ? 'onSnapshot:doc' : 'onSnapshot:docDelta', label, 1, fromCache);
      }
    }
    isFirstSnapshot = false;
    onNext?.(snap);
  };

  const unsub = options
    ? (rawOnSnapshot as any)(target, options, wrappedNext, onError, onCompletion)
    : (rawOnSnapshot as any)(target, wrappedNext, onError, onCompletion);

  return () => {
    closeListener();
    unsub();
  };
}

export async function runTransaction<T>(
  firestore: Firestore,
  updateFunction: (transaction: Transaction) => Promise<T>
): Promise<T> {
  if (!IS_DEV) {
    return rawRunTransaction(firestore, updateFunction);
  }
  return rawRunTransaction(firestore, async (txn) => {
    const wrappedTxn: Transaction = {
      get: async (docRef: any) => {
        const snap = await txn.get(docRef);
        trackFirestoreRead('txn.get', describeRefOrQuery(docRef), 1, Boolean(snap.metadata?.fromCache));
        return snap;
      },
      set: (docRef: any, data: any, options?: any) => {
        trackFirestoreWrite('txn.set', describeRefOrQuery(docRef), 1);
        return options ? txn.set(docRef, data, options) : txn.set(docRef, data);
      },
      update: (docRef: any, data: any, ...more: any[]) => {
        trackFirestoreWrite('txn.update', describeRefOrQuery(docRef), 1);
        return (txn.update as any)(docRef, data, ...more);
      },
      delete: (docRef: any) => {
        trackFirestoreWrite('txn.delete', describeRefOrQuery(docRef), 1);
        return txn.delete(docRef);
      },
    } as Transaction;
    return updateFunction(wrappedTxn);
  });
}

export function writeBatch(firestore: Firestore): WriteBatch {
  const batch = rawWriteBatch(firestore);
  if (!IS_DEV) return batch;
  let pendingOps = 0;
  return {
    set(ref: any, data: any, options?: any) {
      pendingOps += 1;
      return options ? batch.set(ref, data, options) : batch.set(ref, data);
    },
    update(ref: any, data: any, ...more: any[]) {
      pendingOps += 1;
      return (batch.update as any)(ref, data, ...more);
    },
    delete(ref: any) {
      pendingOps += 1;
      return batch.delete(ref);
    },
    async commit() {
      if (pendingOps > 0) {
        trackFirestoreWrite('batch.commit', `batch(${pendingOps})`, pendingOps);
      }
      return batch.commit();
    },
  } as WriteBatch;
}
