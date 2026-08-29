import * as XLSX from 'xlsx';
import type { Product, Brand, Category } from '../types';
import { 
  getProducts, 
  getOrders, 
  getInvoices, 
  getCustomers, 
  getSuppliers, 
  getStockLogs, 
  getExpenses, 
  getCategories, 
  getBrands, 
  getAllUsers, 
  getAllAttendanceRecords 
} from '../firebase/db';

function formatDate(ts: any): string {
  if (!ts) return '';
  const date = typeof ts === 'number' ? new Date(ts) : ts instanceof Date ? ts : ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(date.getTime())) return String(ts);
  return date.toLocaleString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(workbook, filename);
}

export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

export async function exportProductsToCSV(productsList?: Product[], customFilename?: string) {
  const products = productsList || await getProducts(true);
  const headers = [
    'Product ID',
    'SKU',
    'Product Name',
    'Category',
    'Main Category',
    'Sub Category',
    'Child Category',
    'Brand',
    'Sub-Brand',
    'Cost Price (৳)',
    'Selling Price (৳)',
    'Total Stock',
    'Low Stock Threshold',
    'Stock Status',
    'Variants Breakdown',
    'Barcode Value',
    'Status',
    'Archived',
    'Created At'
  ];

  const rows = products.map(p => {
    const totalStock = p.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) ?? 0;
    const variantsStr = p.variants?.map(v => 
      `${v.color || 'Standard'} / ${v.model || 'Standard'} (Stock: ${v.stock || 0}${v.barcodeValue ? `, Barcode: ${v.barcodeValue}` : ''})`
    ).join(' | ') || '';

    return [
      escapeCsv(p.id),
      escapeCsv(p.sku || ''),
      escapeCsv(p.name || ''),
      escapeCsv(p.category || ''),
      escapeCsv(p.mainCategory || ''),
      escapeCsv(p.subCategory || ''),
      escapeCsv(p.childCategory || ''),
      escapeCsv(p.brand || ''),
      escapeCsv(p.subBrand || ''),
      p.costPrice || 0,
      p.sellingPrice || 0,
      totalStock,
      p.reorderThreshold ?? 5,
      escapeCsv(p.stockStatus || (totalStock > 0 ? 'in_stock' : 'out_of_stock')),
      escapeCsv(variantsStr),
      escapeCsv(p.barcodeValue || ''),
      escapeCsv(p.status || 'approved'),
      escapeCsv(p.archived ? 'Yes' : 'No'),
      escapeCsv(formatDate(p.createdAt))
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadCSV(csvContent, customFilename || `products-bulk-export-${dateStr}.csv`);
}

export async function exportBrandsToCSV(brandsList?: Brand[], productsList?: Product[], customFilename?: string) {
  const brands = brandsList || await getBrands();
  const products = productsList || await getProducts(true);

  const headers = [
    'Brand ID',
    'Brand Name',
    'Total Products',
    'In Stock Products',
    'Out of Stock Products',
    'Total Inventory Units',
    'Associated Sub-Brands',
    'Associated Categories'
  ];

  const rows = brands.map(b => {
    const bProducts = products.filter(p => p.brand?.trim().toLowerCase() === b.name?.trim().toLowerCase() && !p.archived);
    const totalProducts = bProducts.length;
    let inStockCount = 0;
    let outOfStockCount = 0;
    let totalStockUnits = 0;
    const subBrandsSet = new Set<string>();
    const categoriesSet = new Set<string>();

    bProducts.forEach(p => {
      const stock = p.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) ?? 0;
      totalStockUnits += stock;
      if (stock > 0 && p.stockStatus !== 'out_of_stock') {
        inStockCount++;
      } else {
        outOfStockCount++;
      }
      if (p.subBrand) subBrandsSet.add(p.subBrand);
      if (p.category) categoriesSet.add(p.category);
    });

    return [
      escapeCsv(b.id),
      escapeCsv(b.name || ''),
      totalProducts,
      inStockCount,
      outOfStockCount,
      totalStockUnits,
      escapeCsv(Array.from(subBrandsSet).join(', ') || 'N/A'),
      escapeCsv(Array.from(categoriesSet).join(', ') || 'N/A')
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadCSV(csvContent, customFilename || `brands-bulk-export-${dateStr}.csv`);
}

export async function exportCategoriesToCSV(categoriesList?: Category[], productsList?: Product[], customFilename?: string) {
  const categories = categoriesList || await getCategories();
  const products = productsList || await getProducts(true);

  const headers = [
    'Category ID',
    'Category Name',
    'Level',
    'Parent ID',
    'Total Products',
    'Total Inventory Units'
  ];

  const rows = categories.map(c => {
    const cProducts = products.filter(p => 
      (p.category === c.name || p.mainCategory === c.name || p.subCategory === c.name || p.childCategory === c.name) && !p.archived
    );
    const totalUnits = cProducts.reduce((sum, p) => sum + (p.variants?.reduce((s, v) => s + (v.stock || 0), 0) ?? 0), 0);

    return [
      escapeCsv(c.id),
      escapeCsv(c.name || ''),
      escapeCsv(c.level || 'main'),
      escapeCsv(c.parentId || ''),
      cProducts.length,
      totalUnits
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadCSV(csvContent, customFilename || `categories-bulk-export-${dateStr}.csv`);
}

export async function exportProductsToExcel(productsList?: Product[]) {
  const products = productsList || await getProducts(true);
  const data = products.map(p => ({
    'Product ID': p.id,
    'SKU': p.sku || '',
    'Name': p.name || '',
    'Category': p.category || '',
    'Brand': p.brand || '',
    'Sub-Brand': p.subBrand || '',
    'Cost Price (৳)': p.costPrice || 0,
    'Selling Price (৳)': p.sellingPrice || 0,
    'Stock Status': p.stockStatus || '',
    'Total Stock': p.variants?.reduce((acc, v) => acc + (v.stock || 0), 0) ?? 0,
    'Archived': p.archived ? 'Yes' : 'No',
    'Barcode': p.barcodeValue || '',
    'Created At': formatDate(p.createdAt)
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `products-export-${dateStr}.xlsx`);
}

export async function exportOrdersToExcel() {
  const orders = await getOrders();
  const data = orders.map(o => ({
    'Order ID': o.id,
    'Customer Name': o.customerName || '',
    'Customer Phone': o.customerPhone || '',
    'Sub-Brand': o.subBrand || '',
    'Sales Channel': o.salesChannel || '',
    'Status': o.status || '',
    'Payment Status': o.paymentStatus || '',
    'Discount (৳)': o.discountAmount || 0,
    'Shipping (৳)': o.shippingCharge || 0,
    'Total Amount (৳)': o.totalAmount || 0,
    'Amount Paid (৳)': o.amountPaid || 0,
    'Amount Due (৳)': o.amountDue || 0,
    'Items Summary': o.items?.map(i => `${i.productName} (${i.variantLabel}) x${i.qty} [৳${i.unitPrice}]`).join('; ') || '',
    'Created By ID': o.createdBy || '',
    'Created At': formatDate(o.createdAt)
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `orders-export-${dateStr}.xlsx`);
}

export async function exportInvoicesToExcel() {
  const invoices = await getInvoices();
  const data = invoices.map(i => ({
    'Invoice ID': i.id,
    'Invoice Number': i.invoiceNumber || '',
    'Order ID': i.orderId || '',
    'Customer Name': i.customerName || '',
    'Customer Phone': i.customerPhone || '',
    'Total Amount (৳)': i.totalAmount || 0,
    'Paid Amount (৳)': i.amountPaid || 0,
    'Due Amount (৳)': i.amountDue || 0,
    'Payment Status': i.paymentStatus || '',
    'Voided': i.voided ? 'Yes' : 'No',
    'Generated By': i.generatedBy || '',
    'Generated At': formatDate(i.generatedAt)
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `invoices-export-${dateStr}.xlsx`);
}

export async function exportCustomersToExcel() {
  const customers = await getCustomers();
  const data = customers.map(c => ({
    'Customer ID': c.customerId || c.id,
    'Name': c.name || '',
    'Phone': c.phone || '',
    'Address': c.address || '',
    'Sub-Brand': c.subBrand || '',
    'Total Orders': c.totalOrders || 0,
    'Lifetime Value (৳)': c.lifetimeValue || 0,
    'Notes': c.notes || '',
    'Created At': formatDate(c.createdAt)
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `customers-export-${dateStr}.xlsx`);
}

export async function exportSuppliersToExcel() {
  const suppliers = await getSuppliers();
  const data = suppliers.map(s => ({
    'Supplier ID': s.id,
    'Name': s.name || '',
    'Phone': s.phone || '',
    'Address': s.address || '',
    'Sub-Brand': s.subBrand || '',
    'Total Purchases (৳)': s.totalPurchases || 0,
    'Total Paid (৳)': s.totalPaid || 0,
    'Outstanding Due (৳)': s.outstandingDue || 0,
    'Notes': s.notes || '',
    'Created At': formatDate(s.createdAt)
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Suppliers');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `suppliers-export-${dateStr}.xlsx`);
}

export async function exportStockLogsToExcel() {
  const logs = await getStockLogs();
  const data = logs.map(l => ({
    'Log ID': l.id,
    'Product ID': l.productId || '',
    'Product Name': l.productName || '',
    'Type': l.type || '',
    'Quantity Change': l.qty || 0,
    'Before Stock': l.beforeQty || 0,
    'New Stock': l.afterQty || 0,
    'Reason': l.reason || '',
    'Performed By': l.userName || '',
    'Timestamp': formatDate(l.timestamp)
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Logs');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `stock-logs-export-${dateStr}.xlsx`);
}

export async function exportExpensesToExcel() {
  const expenses = await getExpenses();
  const data = expenses.map(e => ({
    'Expense ID': e.id,
    'Category': e.category || '',
    'Amount (৳)': e.amount || 0,
    'Date': e.date || '',
    'Sub-Brand': e.subBrand || '',
    'Notes': e.notes || '',
    'Recorded By': e.createdBy || '',
    'Created At': formatDate(e.createdAt)
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `expenses-export-${dateStr}.xlsx`);
}

export async function exportCategoriesBrandsToExcel() {
  const categories = await getCategories();
  const brands = await getBrands();
  
  const catData = categories.map(c => ({
    'Category ID': c.id,
    'Name': c.name || '',
    'Level': c.level || '',
    'Parent ID': c.parentId || ''
  }));
  const brandData = brands.map(b => ({
    'Brand ID': b.id,
    'Brand Name': b.name || ''
  }));

  const workbook = XLSX.utils.book_new();
  const wsCat = XLSX.utils.json_to_sheet(catData);
  const wsBrand = XLSX.utils.json_to_sheet(brandData);
  XLSX.utils.book_append_sheet(workbook, wsCat, 'Categories');
  XLSX.utils.book_append_sheet(workbook, wsBrand, 'Brands');
  
  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `categories-brands-export-${dateStr}.xlsx`);
}

export async function exportUsersToExcel() {
  const users = await getAllUsers();
  const data = users.map(u => ({
    'User ID': u.id,
    'Name': u.name || '',
    'Email': u.email || '',
    'Role': u.role || '',
    'Status': u.status || '',
    'Active': u.active ? 'Yes' : 'No',
    'Sub-Brands Access': u.subBrandAccess?.join(', ') || 'All',
    'Created At': formatDate(u.createdAt)
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Users & Staff');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `users-export-${dateStr}.xlsx`);
}

export async function exportAttendanceToExcel() {
  const attendance = await getAllAttendanceRecords();
  const data = attendance.map(a => ({
    'Record ID': a.id,
    'User ID': a.userId || '',
    'User Name': a.userName || '',
    'Role': a.role || '',
    'Sub-Brand': a.subBrand || '',
    'Date': a.date || '',
    'Check-In Time': formatDate(a.checkInTime),
    'Check-Out Time': formatDate(a.checkOutTime),
    'Status': a.checkOutTime ? 'Checked Out' : 'Active (Checked In)'
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `attendance-export-${dateStr}.xlsx`);
}

export async function exportEverythingWorkbook() {
  const workbook = XLSX.utils.book_new();
  
  try {
    const products = await getProducts(true);
    const prodData = products.map(p => ({
      'Product ID': p.id,
      'SKU': p.sku || '',
      'Name': p.name || '',
      'Category': p.category || '',
      'Brand': p.brand || '',
      'Selling Price (৳)': p.sellingPrice || 0,
      'Total Stock': p.variants?.reduce((acc, v) => acc + (v.stock || 0), 0) ?? 0,
      'Archived': p.archived ? 'Yes' : 'No',
      'Created At': formatDate(p.createdAt)
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(prodData), 'Products');
  } catch (e) { console.error(e); }

  try {
    const orders = await getOrders();
    const ordData = orders.map(o => ({
      'Order ID': o.id,
      'Customer Name': o.customerName || '',
      'Customer Phone': o.customerPhone || '',
      'Sub-Brand': o.subBrand || '',
      'Status': o.status || '',
      'Total Amount (৳)': o.totalAmount || 0,
      'Amount Paid (৳)': o.amountPaid || 0,
      'Amount Due (৳)': o.amountDue || 0,
      'Items Summary': o.items?.map(i => `${i.productName} x${i.qty}`).join('; ') || '',
      'Created At': formatDate(o.createdAt)
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ordData), 'Orders');
  } catch (e) { console.error(e); }

  try {
    const invoices = await getInvoices();
    const invData = invoices.map(i => ({
      'Invoice ID': i.id,
      'Customer Name': i.customerName || '',
      'Total Amount (৳)': i.totalAmount || 0,
      'Paid Amount (৳)': i.amountPaid || 0,
      'Due Amount (৳)': i.amountDue || 0,
      'Payment Status': i.paymentStatus || '',
      'Generated At': formatDate(i.generatedAt)
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(invData), 'Invoices');
  } catch (e) { console.error(e); }

  try {
    const customers = await getCustomers();
    const custData = customers.map(c => ({
      'Customer ID': c.customerId || c.id,
      'Name': c.name || '',
      'Phone': c.phone || '',
      'Total Orders': c.totalOrders || 0,
      'Lifetime Value (৳)': c.lifetimeValue || 0,
      'Created At': formatDate(c.createdAt)
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(custData), 'Customers');
  } catch (e) { console.error(e); }

  try {
    const suppliers = await getSuppliers();
    const suppData = suppliers.map(s => ({
      'Supplier ID': s.id,
      'Name': s.name || '',
      'Phone': s.phone || '',
      'Total Purchases (৳)': s.totalPurchases || 0,
      'Outstanding Due (৳)': s.outstandingDue || 0,
      'Created At': formatDate(s.createdAt)
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(suppData), 'Suppliers');
  } catch (e) { console.error(e); }

  try {
    const logs = await getStockLogs();
    const logData = logs.map(l => ({
      'Log ID': l.id,
      'Product Name': l.productName || '',
      'Type': l.type || '',
      'Quantity Change': l.qty || 0,
      'New Stock': l.afterQty || 0,
      'Reason': l.reason || '',
      'Timestamp': formatDate(l.timestamp)
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(logData), 'Stock Logs');
  } catch (e) { console.error(e); }

  try {
    const expenses = await getExpenses();
    const expData = expenses.map(e => ({
      'Expense ID': e.id,
      'Category': e.category || '',
      'Amount (৳)': e.amount || 0,
      'Date': e.date || ''
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expData), 'Expenses');
  } catch (e) { console.error(e); }

  try {
    const users = await getAllUsers();
    const usrData = users.map(u => ({
      'User ID': u.id,
      'Name': u.name || '',
      'Email': u.email || '',
      'Role': u.role || '',
      'Status': u.status || ''
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(usrData), 'Users');
  } catch (e) { console.error(e); }

  try {
    const attendance = await getAllAttendanceRecords();
    const attData = attendance.map(a => ({
      'Record ID': a.id,
      'User Name': a.userName || '',
      'Date': a.date || '',
      'Check-In': formatDate(a.checkInTime),
      'Check-Out': formatDate(a.checkOutTime)
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(attData), 'Attendance');
  } catch (e) { console.error(e); }

  const dateStr = new Date().toISOString().split('T')[0];
  downloadWorkbook(workbook, `complete-inventory-backup-${dateStr}.xlsx`);
}
