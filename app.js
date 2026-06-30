// Register Service Worker for offline capability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}

// --- STATE DATA ---
let inventory = [];
let products = inventory;
let customers = [];
let suppliers = [];
let cart = JSON.parse(localStorage.getItem('posCart')) || [];
let salesHistory = [];
let purchases = [];
let purchaseCart = [];
let isLoading = false;
let hasError = false;
let activeProfileCustomer = null;
let editingProduct = null;
let editingCustomer = null;
let returnCart = [];
let activeReturnCustomer = null;
let lastCompletedSale = null;
let lastCompletedCustomer = null;
let vanStock = JSON.parse(localStorage.getItem('posVanStock')) || {};
let journeyPlan = JSON.parse(localStorage.getItem('posJourneyPlan')) || [];
let users = [];
let activeUser = null;
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxwkA3AUQ2uRiVNKfsrmtidH5GDKm3DoHb50qewPqfhKLILl-Q8UqB6QzvKlV_JVSRyGg/exec";
const APP_SECRET_TOKEN = "POS_AUTH_KEY_2026";

const saveCartState = () => {
  localStorage.setItem('posCart', JSON.stringify(cart));
};

const printThermalReceipt = (saleData) => {
  const thermalReceipt = document.getElementById('thermalReceipt');
  if (!thermalReceipt) return;

  const itemsHtml = (saleData.items || []).map(item => `
    <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
      <span>${item.name} x${item.qty}</span>
      <span>${(item.price * item.qty).toLocaleString()} د.ع</span>
    </div>
  `).join('');

  thermalReceipt.innerHTML = `
    <div style="font-family: 'Cairo', sans-serif; direction: rtl; width: 80mm; padding: 10px; background: white; color: black; box-sizing: border-box;">
      <div style="text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px;">
        <h2 style="font-size: 14px; font-weight: 900; margin: 0;">نظام المبيعات والمخازن الذكي</h2>
        <span style="font-size: 10px; font-weight: bold;">وصل مبيعات (حراري)</span>
      </div>
      
      <div style="font-size: 11px; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 5px;">
        <div>رقم الفاتورة: ${saleData.invoiceId}</div>
        <div>التاريخ: ${saleData.date}</div>
        <div>العميل: ${saleData.customerName}</div>
      </div>
      
      <div style="margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 5px;">
        <div style="font-size: 10px; font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>المادة والكمية</span>
          <span>السعر</span>
        </div>
        ${itemsHtml}
      </div>
      
      <div style="font-size: 11px; font-weight: bold;">
        <div style="display: flex; justify-content: space-between;">
          <span>المجموع الفرعي:</span>
          <span>${(saleData.subtotal || saleData.totalAmount || 0).toLocaleString()} د.ع</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>الخصم:</span>
          <span>${(saleData.discount || 0).toLocaleString()} د.ع</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px; border-top: 1px solid #000; padding-top: 3px;">
          <span>المجموع الكلي:</span>
          <span>${(saleData.totalAmount || 0).toLocaleString()} د.ع</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
          <span>المستلم:</span>
          <span>${(saleData.receivedAmount || 0).toLocaleString()} د.ع</span>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 15px; font-size: 10px; border-top: 1px dashed #000; padding-top: 5px;">
        شكراً لتعاملكم معنا!
      </div>
    </div>
  `;

  document.body.classList.add('print-receipt-mode');
  window.print();
  document.body.classList.remove('print-receipt-mode');
  thermalReceipt.innerHTML = '';
};

const searchArchive = async (invoiceId, query) => {
  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: "searchArchiveInvoices",
        invoiceId: invoiceId,
        query: query,
        token: APP_SECRET_TOKEN
      }),
      redirect: 'follow'
    });
    const resData = await response.json();
    if (resData && resData.status === 'success') {
      return resData.invoices || [];
    } else {
      showArabicToast(resData.message || 'فشل البحث في الأرشيف', 'error');
      return [];
    }
  } catch (err) {
    console.error("Archive search failed:", err);
    showArabicToast("فشل الاتصال بالسيرفر للبحث في الأرشيف", "error");
    return [];
  }
};

const renderArchiveResults = (invoices) => {
  if (!salesHistoryList) return;
  salesHistoryList.innerHTML = '';

  if (!invoices || invoices.length === 0) {
    salesHistoryList.innerHTML = '<div class="text-center py-8 text-xs text-gray-400">لا توجد نتائج مطابقة في الأرشيف.</div>';
    return;
  }

  invoices.forEach(sale => {
    const row = document.createElement('div');
    row.className = 'bg-[#ffebee]/40 p-3.5 rounded-xl border border-red-100 flex justify-between items-center select-none cursor-pointer hover:border-red-200 transition-all active:scale-[0.98]';
    
    let badgeClass = '';
    if (sale.status === 'مدفوع') badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
    else if (sale.status === 'جزئي') badgeClass = 'bg-amber-50 text-amber-700 border-amber-100';
    else badgeClass = 'bg-red-50 text-red-700 border-red-100';

    row.innerHTML = `
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-extrabold text-gray-900">${sale.customerName}</span>
          <span class="text-[9px] px-2 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-200 font-black">مؤرشفة</span>
          <span class="text-[9px] px-2 py-0.5 rounded-full border ${badgeClass} font-black">${sale.status || 'مدفوع'}</span>
        </div>
        <span class="text-[9px] text-gray-400 font-bold block">${sale.date}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs font-black text-red-700 bg-red-50 px-3 py-1 rounded-lg">
          ${parseFloat(sale.totalAmount || 0).toLocaleString()} د.ع
        </span>
        <button class="btn-print-archive-invoice w-7 h-7 rounded-lg bg-white text-gray-500 hover:text-gray-800 flex items-center justify-center border border-gray-200 cursor-pointer transition-colors" title="🖨️ طباعة حرارية">
          <i class="fa-solid fa-print text-[10px]"></i>
        </button>
      </div>
    `;

    row.addEventListener('click', () => {
      const normalizedSale = {
        invoiceId: sale.invoiceId,
        date: sale.date,
        customerName: sale.customerName,
        subtotal: parseFloat(sale.subtotal) || parseFloat(sale.totalAmount) || 0,
        discount: parseFloat(sale.discount) || 0,
        totalAmount: parseFloat(sale.totalAmount) || 0,
        receivedAmount: parseFloat(sale.receivedAmount) || 0,
        status: sale.status || 'مدفوع',
        items: typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || [])
      };
      openInvoiceDetailsModal(normalizedSale);
    });

    row.querySelector('.btn-print-archive-invoice').addEventListener('click', (e) => {
      e.stopPropagation();
      const normalizedSale = {
        invoiceId: sale.invoiceId,
        date: sale.date,
        customerName: sale.customerName,
        subtotal: parseFloat(sale.subtotal) || parseFloat(sale.totalAmount) || 0,
        discount: parseFloat(sale.discount) || 0,
        totalAmount: parseFloat(sale.totalAmount) || 0,
        receivedAmount: parseFloat(sale.receivedAmount) || 0,
        status: sale.status || 'مدفوع',
        items: typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || [])
      };
      const matchedCustomer = customers.find(c => c.name === sale.customerName) || null;
      printThermalViaRawBT(normalizedSale, matchedCustomer);
    });

    salesHistoryList.appendChild(row);
  });
};

// --- DEBOUNCE UTILITY ---
const debounce = (func, delay) => {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
};

// --- PRICE CALCULATION & VOICE INPUT HELPERS ---
const getProductPrices = (prod) => {
  const isCarton = String(prod.unit || prod.category).trim() === 'كرتون';
  let cartonPrice = 0;
  let unitPrice = 0;
  
  if (isCarton) {
    cartonPrice = prod.price;
    unitPrice = Math.round(prod.price / 12);
  } else {
    unitPrice = prod.price;
    cartonPrice = prod.price * 12;
  }
  
  return { cartonPrice, unitPrice };
};

const getActiveSearchInput = () => {
  if (smartAiModal && !smartAiModal.classList.contains('hidden')) {
    return aiTextInput;
  }
  const activeView = Object.keys(views).find(key => !views[key].el.classList.contains('hidden'));
  if (activeView === 'sales') return salesSearchBar;
  if (activeView === 'customers') return document.getElementById('customers-search-bar');
  if (activeView === 'inventory') return document.getElementById('inventory-search-bar');
  return null;
};

// --- CUSTOM MODALS IMPLEMENTATION ---
const showCustomAlert = (message) => {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'custom-modal-backdrop';
    
    const modal = document.createElement('div');
    modal.className = 'custom-modal-window';
    modal.innerHTML = `
      <div class="w-12 h-12 rounded-2xl bg-[#e8ecea] text-[#1e5631] flex items-center justify-center text-xl">
        <i class="fa-solid fa-circle-info"></i>
      </div>
      <div class="space-y-1.5 w-full">
        <h3 class="font-black text-gray-900 text-sm">تنبيه</h3>
        <p class="text-xs text-gray-500 leading-relaxed font-semibold px-2">${message}</p>
      </div>
      <button class="w-full py-3 bg-[#1e5631] hover:bg-[#163e23] text-white font-bold text-xs rounded-xl cursor-pointer shadow-sm active:scale-98 transition-all">
        موافق
      </button>
    `;
    
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    
    requestAnimationFrame(() => {
      backdrop.classList.add('active');
    });
    
    const close = () => {
      backdrop.classList.remove('active');
      setTimeout(() => {
        backdrop.remove();
        resolve();
      }, 250);
    };
    
    modal.querySelector('button').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
  });
};

const showCustomConfirm = (message) => {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'custom-modal-backdrop';
    
    const modal = document.createElement('div');
    modal.className = 'custom-modal-window';
    modal.innerHTML = `
      <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl">
        <i class="fa-solid fa-circle-question"></i>
      </div>
      <div class="space-y-1.5 w-full">
        <h3 class="font-black text-gray-900 text-sm">تأكيد الإجراء</h3>
        <p class="text-xs text-gray-500 leading-relaxed font-semibold px-2">${message}</p>
      </div>
      <div class="flex gap-3 w-full">
        <button id="confirm-btn-yes" class="flex-1 py-3 bg-[#1e5631] hover:bg-[#163e23] text-white font-bold text-xs rounded-xl cursor-pointer shadow-sm active:scale-98 transition-all">
          نعم، متأكد
        </button>
        <button id="confirm-btn-no" class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer active:scale-98 transition-all">
          إلغاء
        </button>
      </div>
    `;
    
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    
    requestAnimationFrame(() => {
      backdrop.classList.add('active');
    });
    
    const close = (result) => {
      backdrop.classList.remove('active');
      setTimeout(() => {
        backdrop.remove();
        resolve(result);
      }, 250);
    };
    
    modal.querySelector('#confirm-btn-yes').addEventListener('click', () => close(true));
    modal.querySelector('#confirm-btn-no').addEventListener('click', () => close(false));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
  });
};

const showCustomPrompt = (message, defaultValue = '') => {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'custom-modal-backdrop';
    
    const modal = document.createElement('div');
    modal.className = 'custom-modal-window';
    modal.innerHTML = `
      <div class="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-650 flex items-center justify-center text-xl">
        <i class="fa-solid fa-pen-to-square"></i>
      </div>
      <div class="space-y-1.5 w-full">
        <h3 class="font-black text-gray-900 text-sm">إدخال بيانات</h3>
        <p class="text-xs text-gray-500 leading-relaxed font-semibold px-2">${message}</p>
        <input type="text" id="custom-prompt-input" value="${defaultValue}" class="w-full bg-[#f4f6f5] text-gray-800 text-xs px-3.5 py-3 rounded-xl border border-gray-100 focus:outline-none focus:bg-white focus:border-[#1e5631] transition-all font-semibold mt-2 text-right">
      </div>
      <div class="flex gap-3 w-full">
        <button id="prompt-btn-ok" class="flex-1 py-3 bg-[#1e5631] hover:bg-[#163e23] text-white font-bold text-xs rounded-xl cursor-pointer shadow-sm active:scale-98 transition-all">
          تأكيد
        </button>
        <button id="prompt-btn-cancel" class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer active:scale-98 transition-all">
          إلغاء
        </button>
      </div>
    `;
    
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    
    const input = modal.querySelector('#custom-prompt-input');
    
    requestAnimationFrame(() => {
      backdrop.classList.add('active');
      input.focus();
      input.select();
    });
    
    const close = (submitted) => {
      const val = submitted ? input.value : null;
      backdrop.classList.remove('active');
      setTimeout(() => {
        backdrop.remove();
        resolve(val);
      }, 250);
    };
    
    modal.querySelector('#prompt-btn-ok').addEventListener('click', () => close(true));
    modal.querySelector('#prompt-btn-cancel').addEventListener('click', () => close(false));
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') close(true);
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
  });
};

window.alert = showCustomAlert;
window.confirm = showCustomConfirm;
window.prompt = showCustomPrompt;

// --- LOCAL STORAGE DATA CACHING HELPERS ---
const saveAllStatesToLocalStorage = () => {
  localStorage.setItem('inventory', JSON.stringify(inventory));
  localStorage.setItem('customers', JSON.stringify(customers));
  localStorage.setItem('salesHistory', JSON.stringify(salesHistory));
  localStorage.setItem('purchases', JSON.stringify(purchases));
  localStorage.setItem('suppliers', JSON.stringify(suppliers));
  localStorage.setItem('users', JSON.stringify(users));
  localStorage.setItem('posJourneyPlan', JSON.stringify(journeyPlan));
};

const loadStatesFromLocalStorage = () => {
  inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
  products = inventory;
  customers = JSON.parse(localStorage.getItem('customers') || '[]');
  salesHistory = JSON.parse(localStorage.getItem('salesHistory') || '[]');
  purchases = JSON.parse(localStorage.getItem('purchases') || '[]');
  suppliers = JSON.parse(localStorage.getItem('suppliers') || '[]');
  users = JSON.parse(localStorage.getItem('users') || '[]');
  journeyPlan = JSON.parse(localStorage.getItem('posJourneyPlan')) || [];
};

// --- OPTIMISTIC UI BACKGROUND SYNC QUEUE ---
let syncQueue = JSON.parse(localStorage.getItem('posSyncQueue')) || [];
const saveQueue = () => localStorage.setItem('posSyncQueue', JSON.stringify(syncQueue));

const addToSyncQueue = (payload) => {
  syncQueue.push({
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    payload: payload
  });
  saveQueue();
  showArabicToast("تم حفظ العملية محلياً (بدون إنترنت) وسيتم رفعها تلقائياً عند عودة الاتصال", "info");
  processSyncQueue();
};

let isProcessingQueue = false;
const processSyncQueue = async () => {
  if (isProcessingQueue) return;
  if (!navigator.onLine) return;
  if (syncQueue.length === 0) return;

  isProcessingQueue = true;
  console.log(`Background sync processing... ${syncQueue.length} items in queue.`);

  while (syncQueue.length > 0) {
    const item = syncQueue[0];
    try {
      const bodyPayload = { ...item.payload, token: APP_SECRET_TOKEN };
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(bodyPayload),
        redirect: 'follow'
      });
      const resData = await response.json();
      if (resData && resData.status === 'success') {
        syncQueue.shift();
        saveQueue();
        console.log("Sync item processed successfully:", item.payload.action);
      } else {
        console.error("Server returned error for action:", item.payload.action, resData ? resData.message : "No response");
        if (resData && resData.status === 'success') {
          syncQueue.shift();
          saveQueue();
        } else {
          throw new Error(resData ? resData.message : "Request failed on server");
        }
      }
    } catch (err) {
      console.error("Failed to sync queue item:", err);
      break;
    }
  }

  isProcessingQueue = false;
};

window.addEventListener('online', processSyncQueue);
setInterval(processSyncQueue, 30000);

const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(`${position.coords.latitude},${position.coords.longitude}`);
      },
      (error) => {
        let msg = "خطأ غير معروف";
        if (error.code === error.PERMISSION_DENIED) msg = "تم رفض إذن الوصول للموقع";
        else if (error.code === error.POSITION_UNAVAILABLE) msg = "معلومات الموقع غير متوفرة";
        else if (error.code === error.TIMEOUT) msg = "انتهت مهلة تحديد الموقع";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  });
};

// --- HAVERSINE GEOLOCATION AUTO-SELECT LOGIC ---
const getHaversineDistanceInMeters = (coords1, coords2) => {
  const [lat1, lon1] = coords1;
  const [lat2, lon2] = coords2;
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

const parseGpsCoords = (gpsStr) => {
  if (!gpsStr) return null;
  const parts = String(gpsStr).split(',');
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0].trim());
  const lon = parseFloat(parts[1].trim());
  if (isNaN(lat) || isNaN(lon)) return null;
  return [lat, lon];
};

const autoSelectNearestCustomer = async () => {
  try {
    const userGpsStr = await getCurrentLocation();
    const userCoords = parseGpsCoords(userGpsStr);
    if (!userCoords) return;

    let nearestCustomer = null;
    let minDistance = Infinity;

    customers.forEach(cust => {
      const lat = parseFloat(cust.Latitude);
      const lon = parseFloat(cust.Longitude);
      if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
        const dist = getHaversineDistanceInMeters(userCoords, [lat, lon]);
        if (dist < minDistance) {
          minDistance = dist;
          nearestCustomer = cust;
        }
      }
    });

    if (nearestCustomer) {
      selectCustomerInDropdown(nearestCustomer.id);
      console.log(`Nearest customer: ${nearestCustomer.name} (${minDistance.toFixed(1)} meters away)`);
      showArabicToast(`تم تحديد العميل الأقرب تلقائياً: ${nearestCustomer.name} (${minDistance.toFixed(0)} متر)`, 'success');
    }
  } catch (err) {
    console.warn("Could not auto-select nearest customer:", err);
  }
};

// --- DOM ELEMENTS ---
const viewSales = document.getElementById('view-sales');
const viewCustomers = document.getElementById('view-customers');
const viewInventory = document.getElementById('view-inventory');

const navSales = document.getElementById('nav-sales');
const navCustomers = document.getElementById('nav-customers');
const navInventory = document.getElementById('nav-inventory');

const headerMenuBtn = document.getElementById('header-menu-btn');
const headerMenuDropdown = document.getElementById('header-menu-dropdown');
const menuSalesHistoryBtn = document.getElementById('menu-sales-history-btn');
const pullIndicator = document.getElementById('pull-to-refresh-indicator');

const headerAddBtn = document.getElementById('header-add-btn');
const salesProductsCount = document.getElementById('sales-products-count');
const salesProductsGrid = document.getElementById('sales-products-grid');

const headerCartBtn = document.getElementById('header-cart-btn');
const cartBadgeQty = document.getElementById('cart-badge-qty');

const homeQuickMenu = document.getElementById('home-quick-menu');
const quickMenuDismiss = document.getElementById('quick-menu-dismiss');
const quickMenuClose = document.getElementById('quick-menu-close');
const quickAddProduct = document.getElementById('quick-add-product');
const quickAddCustomer = document.getElementById('quick-add-customer');

const addProductModal = document.getElementById('add-product-modal');
const addProductContent = document.getElementById('add-product-content');
const addProductDismiss = document.getElementById('add-product-dismiss');
const addProductClose = document.getElementById('add-product-close');
const productForm = document.getElementById('product-form');

const addCustomerModal = document.getElementById('add-customer-modal');
const addCustomerContent = document.getElementById('add-customer-content');
const addCustomerDismiss = document.getElementById('add-customer-dismiss');
const addCustomerClose = document.getElementById('add-customer-close');
const customerForm = document.getElementById('customer-form');
const cWhatsAppBtn = document.getElementById('c-whatsapp-btn');

const customersAddBtnShortcut = document.getElementById('customers-add-btn-shortcut');
const inventoryAddBtnShortcut = document.getElementById('inventory-add-btn-shortcut');

const customersList = document.getElementById('customers-list');
const inventoryList = document.getElementById('inventory-list');

const cartDrawer = document.getElementById('cart-drawer');
const cartDrawerDismiss = document.getElementById('cart-drawer-dismiss');
const cartDrawerClose = document.getElementById('cart-drawer-close');
const cartRowsContainer = document.getElementById('cart-rows-container');
const cartQtyIndicator = document.getElementById('cart-qty-indicator');
const cartTotalPrice = document.getElementById('cart-total-price');
const cartCompleteSaleBtn = document.getElementById('cart-complete-sale-btn');

const checkoutModal = document.getElementById('checkout-modal');
const checkoutDismiss = document.getElementById('checkout-dismiss');
const checkoutClose = document.getElementById('checkout-close');
const checkoutSubtotalVal = document.getElementById('checkout-subtotal-val');
const checkoutFinalVal = document.getElementById('checkout-final-val');
const checkoutCustomerSelect = document.getElementById('checkout-customer-select');
const checkoutDateInput = document.getElementById('checkout-date-input');
const checkoutDiscount = document.getElementById('checkout-discount');
const checkoutSavings = document.getElementById('checkout-savings');
const checkoutReceivedInput = document.getElementById('checkout-received-input');
const checkoutDebtBadge = document.getElementById('checkout-debt-badge');
const checkoutConfirmBtn = document.getElementById('checkout-confirm-btn');

const successDoneModal = document.getElementById('success-done-modal');
const successModalDesc = document.getElementById('success-modal-desc');
const successModalDoneBtn = document.getElementById('success-modal-done-btn');

const salesHistoryModal = document.getElementById('sales-history-modal');
const salesHistoryContent = document.getElementById('sales-history-content');
const salesHistoryDismiss = document.getElementById('sales-history-dismiss');
const salesHistoryClose = document.getElementById('sales-history-close');
const salesHistoryList = document.getElementById('sales-history-list');

const customerProfileModal = document.getElementById('customer-profile-modal');
const customerProfileContent = document.getElementById('customer-profile-content');
const customerProfileDismiss = document.getElementById('customer-profile-dismiss');
const customerProfileClose = document.getElementById('customer-profile-close');
const profileCName = document.getElementById('profile-c-name');
const profileCPhone = document.getElementById('profile-c-phone');
const profileCDebt = document.getElementById('profile-c-debt');
const profileLedgerList = document.getElementById('profile-ledger-list');
const profilePayDebtBtn = document.getElementById('profile-pay-debt-btn');
const payDebtFormContainer = document.getElementById('pay-debt-form-container');
const payDebtAmount = document.getElementById('pay-debt-amount');
const payDebtCancel = document.getElementById('pay-debt-cancel');
const payDebtSubmit = document.getElementById('pay-debt-submit');
const productModalTitle = document.getElementById('product-modal-title');
const productSubmitBtn = document.getElementById('product-submit-btn');

const headerPurchaseBtn = document.getElementById('header-purchase-btn');
const menuPurchaseHistoryBtn = document.getElementById('menu-purchase-history-btn');

const addPurchaseModal = document.getElementById('add-purchase-modal');
const addPurchaseContent = document.getElementById('add-purchase-content');
const addPurchaseDismiss = document.getElementById('add-purchase-dismiss');
const addPurchaseClose = document.getElementById('add-purchase-close');

const purSupplier = document.getElementById('pur-supplier');
const purItemSelect = document.getElementById('pur-item-select');
const purItemQty = document.getElementById('pur-item-qty');
const purAddItemBtn = document.getElementById('pur-add-item-btn');
const purItemsList = document.getElementById('pur-items-list');

const purSummaryBefore = document.getElementById('pur-summary-before');
const purSummaryAfter = document.getElementById('pur-summary-after');
const purSubmitBtn = document.getElementById('pur-submit-btn');

const purchaseHistoryModal = document.getElementById('purchase-history-modal');
const purchaseHistoryContent = document.getElementById('purchase-history-content');
const purchaseHistoryDismiss = document.getElementById('purchase-history-dismiss');
const purchaseHistoryClose = document.getElementById('purchase-history-close');
const purchaseHistoryList = document.getElementById('purchase-history-list');

const purchaseDetailsModal = document.getElementById('purchase-details-modal');
const purchaseDetailsContent = document.getElementById('purchase-details-content');
const purchaseDetailsDismiss = document.getElementById('purchase-details-dismiss');
const purchaseDetailsClose = document.getElementById('purchase-details-close');

const purDetailId = document.getElementById('pur-detail-id');
const purDetailCompany = document.getElementById('pur-detail-company');
const purDetailDatetime = document.getElementById('pur-detail-datetime');
const purDetailSubtotal = document.getElementById('pur-detail-subtotal');
const purDetailProfit = document.getElementById('pur-detail-profit');
const purDetailTotal = document.getElementById('pur-detail-total');
const purDetailItems = document.getElementById('pur-detail-items');

const posToastContainer = document.getElementById('pos-toast-container');

const invoiceDetailsModal = document.getElementById('invoice-details-modal');
const invoiceDetailsDismiss = document.getElementById('invoice-details-dismiss');
const invoiceDetailsClose = document.getElementById('invoice-details-close');
const invoiceDetailsContent = document.getElementById('invoice-details-content');
const detailInvoiceId = document.getElementById('detail-invoice-id');
const detailInvoiceDate = document.getElementById('detail-invoice-date');
const detailInvoiceCustomer = document.getElementById('detail-invoice-customer');
const detailInvoiceSubtotal = document.getElementById('detail-invoice-subtotal');
const detailInvoiceDiscount = document.getElementById('detail-invoice-discount');
const detailInvoiceTotal = document.getElementById('detail-invoice-total');
const detailInvoiceReceived = document.getElementById('detail-invoice-received');
const detailInvoiceStatus = document.getElementById('detail-invoice-status');
const detailInvoiceItems = document.getElementById('detail-invoice-items');

// --- NEW FEATURES DOM SELECTORS ---
const purPaidAmount = document.getElementById('pur-paid-amount');
const purDebtDisplay = document.getElementById('pur-debt-display');

const menuSupplierDebtsBtn = document.getElementById('menu-supplier-debts-btn');
const supplierDebtsModal = document.getElementById('supplier-debts-modal');
const supplierDebtsClose = document.getElementById('supplier-debts-close');
const paySupplierToggleBtn = document.getElementById('pay-supplier-toggle-btn');
const paySupplierFormContainer = document.getElementById('pay-supplier-form-container');
const paySupplierCancel = document.getElementById('pay-supplier-cancel');
const paySupplierSelect = document.getElementById('pay-supplier-select');
const paySupplierAmount = document.getElementById('pay-supplier-amount');
const paySupplierSubmit = document.getElementById('pay-supplier-submit');
const suppliersListContainer = document.getElementById('suppliers-list-container');

const editProductModal = document.getElementById('edit-product-modal');
const editProductClose = document.getElementById('edit-product-close');
const editProductForm = document.getElementById('edit-product-form');
const editPName = document.getElementById('edit-p-name');
const editPBarcode = document.getElementById('edit-p-barcode');
const editPSell = document.getElementById('edit-p-sell');
const editPBuy = document.getElementById('edit-p-buy');
const editPWholesale = document.getElementById('edit-p-wholesale');
const editPCategory = document.getElementById('edit-p-category');
const editPQty = document.getElementById('edit-p-qty');
const editPUnitsPerCarton = document.getElementById('edit-p-units-per-carton');

const editCustomerModal = document.getElementById('edit-customer-modal');
const editCustomerClose = document.getElementById('edit-customer-close');
const editCustomerForm = document.getElementById('edit-customer-form');
const editCName = document.getElementById('edit-c-name');
const editCAddress = document.getElementById('edit-c-address');
const editCPhone = document.getElementById('edit-c-phone');
const editCDebtRead = document.getElementById('edit-c-debt-read');

const addReturnModal = document.getElementById('add-return-modal');
const addReturnClose = document.getElementById('add-return-close');
const retCustomerNameDisplay = document.getElementById('ret-customer-name-display');
const retItemSelect = document.getElementById('ret-item-select');
const retItemQty = document.getElementById('ret-item-qty');
const retAddItemBtn = document.getElementById('ret-add-item-btn');
const retItemsList = document.getElementById('ret-items-list');
const retRefundMethod = document.getElementById('ret-refund-method');
const retSummaryTotal = document.getElementById('ret-summary-total');
const retSubmitBtn = document.getElementById('ret-submit-btn');

const invoiceOptionsModal = document.getElementById('invoice-options-modal');
const optPrintBtn = document.getElementById('opt-print-btn');
const optWhatsappBtn = document.getElementById('opt-whatsapp-btn');
const printSection = document.getElementById('print-section');
const detailPrintBtn = document.getElementById('detail-print-btn');
const detailWhatsappBtn = document.getElementById('detail-whatsapp-btn');

// --- SMART AI ASSISTANT DOM SELECTORS ---
const smartAiBtn = document.getElementById('smart-ai-btn');
const smartAiModal = document.getElementById('smart-ai-modal');
const smartAiClose = document.getElementById('smart-ai-close');
const aiTextInput = document.getElementById('ai-text-input');
const aiMicBtn = document.getElementById('ai-mic-btn');
const aiMicStatusDot = document.getElementById('ai-mic-status-dot');
const aiMicBtnText = document.getElementById('ai-mic-btn-text');
const aiExecuteBtn = document.getElementById('ai-execute-btn');
const aiExecuteIcon = document.getElementById('ai-execute-icon');
const aiExecuteText = document.getElementById('ai-execute-text');
const aiLoadingState = document.getElementById('ai-loading-state');

// --- NEW DOM SELECTORS FOR AI & QUICK CUSTOMER ---
const salesMicBtn = document.getElementById('sales-mic-btn');
const salesVoiceBtn = document.getElementById('sales-voice-btn');
const checkoutQuickCustomerBtn = document.getElementById('checkout-quick-customer-btn');
const checkoutCustomerSelectWrapper = document.getElementById('checkout-customer-select-wrapper');
const checkoutQuickCustomerWrapper = document.getElementById('checkout-quick-customer-wrapper');
const checkoutQuickCustomerName = document.getElementById('checkout-quick-customer-name');

// --- NEW DOM SELECTORS FOR CAMERA SCANNER ---
const salesSearchBar = document.getElementById('sales-search-bar');
const salesScanBtn = document.getElementById('sales-scan-btn');
const headerCameraBtn = document.getElementById('header-camera-btn');
const cameraScannerModal = document.getElementById('camera-scanner-modal');
const cameraScannerCloseX = document.getElementById('camera-scanner-close-x');
const cameraScannerCloseBtn = document.getElementById('camera-scanner-close-btn');

// --- LOGIN & AUTH DOM SELECTORS ---
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const headerUserName = document.getElementById('header-user-name');
const headerSalesHistoryBtn = document.getElementById('header-sales-history-btn');
const headerLogoutBtn = document.getElementById('header-logout-btn');
const menuDarkModeBtn = document.getElementById('menu-dark-mode-btn');

// --- VIEW NAVIGATION ROUTING ---
const views = {
  sales: { el: viewSales, tab: navSales },
  customers: { el: viewCustomers, tab: navCustomers },
  inventory: { el: viewInventory, tab: navInventory }
};

const switchView = (targetViewKey) => {
  closeQuickMenu();
  
  // Close cart drawers and modals on switch
  closeCartDrawer();
  closeCheckoutModal();

  // Hide the global page header on screens other than sales page
  const mainHeader = document.getElementById('main-header');
  if (mainHeader) {
    if (targetViewKey === 'sales') {
      mainHeader.classList.remove('hidden');
    } else {
      mainHeader.classList.add('hidden');
    }
  }
  
  Object.keys(views).forEach(key => {
    const { el, tab } = views[key];
    const indicator = tab.querySelector('.nav-indicator');
    
    if (key === targetViewKey) {
      el.classList.remove('hidden');
      tab.classList.add('text-[#1e5631]');
      tab.classList.remove('text-gray-400');
      if (indicator) {
        indicator.classList.add('bg-[#e8ecea]', 'text-[#1e5631]');
      }

      // Context-aware view rendering on entry
      if (key === 'sales') {
        renderSalesGrid();
      } else if (key === 'customers') {
        renderCustomersList();
      } else if (key === 'inventory') {
        renderInventoryList();
      }
    } else {
      el.classList.add('hidden');
      tab.classList.remove('text-[#1e5631]');
      tab.classList.add('text-gray-400');
      if (indicator) {
        indicator.classList.remove('bg-[#e8ecea]', 'text-[#1e5631]');
      }
    }
  });
};

// --- ARABIC TOASTS NOTIFIER ---
const showArabicToast = (message, type = 'success') => {
  const toast = document.createElement('div');
  toast.className = `p-3.5 rounded-2xl shadow-md text-xs font-bold flex items-center justify-between border transition-all duration-300 transform translate-y-[-10px] opacity-0 pointer-events-auto`;
  
  const colors = {
    success: 'bg-[#e8ecea] text-[#1e5631] border-[#c9d6cf]',
    error: 'bg-red-50 text-red-800 border-red-100',
    info: 'bg-gray-50 text-gray-800 border-gray-105'
  };
  
  const icons = {
    success: '<i class="fa-solid fa-circle-check text-[#1e5631] ml-2"></i>',
    error: '<i class="fa-solid fa-circle-exclamation text-red-500 ml-2"></i>',
    info: '<i class="fa-solid fa-circle-info text-gray-500 ml-2"></i>'
  };

  toast.className += ` ${colors[type]}`;
  toast.innerHTML = `
    <div class="flex items-center">
      ${icons[type]}
      <span>${message}</span>
    </div>
    <button class="mr-4 text-gray-400 hover:text-gray-600 focus:outline-none" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark text-[10px]"></i>
    </button>
  `;

  posToastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('translate-y-[-10px]', 'opacity-0');
  }, 10);

  const duration = type === 'success' ? 1500 : 2500;
  setTimeout(() => {
    toast.classList.add('translate-y-[-10px]', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

// --- FETCH INITIAL DATA (GET) ---
const fetchData = (isSilent = false, username = '', password = '') => {
  // Immediately load and render from localStorage if available
  loadStatesFromLocalStorage();
  const hasCachedData = inventory.length > 0 || customers.length > 0;
  if (hasCachedData) {
    renderSalesGrid();
    renderCustomersList();
    renderInventoryList();
  }

  const runSilently = isSilent || hasCachedData;

  if (!runSilently) {
    isLoading = true;
    hasError = false;
    renderSalesGrid();
    renderCustomersList();
    renderInventoryList();
  }

  return fetch(BACKEND_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: 'getData',
      username: username,
      password: password,
      token: APP_SECRET_TOKEN
    })
  })
    .then(res => {
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json();
    })
    .then(data => {
      if (data && data.status === 'error') {
        throw new Error(data.message || 'خطأ في اسم المستخدم أو كلمة المرور');
      }
      // Safe mapping for products
      if (data.products && Array.isArray(data.products)) {
        inventory = data.products.map((item, idx) => ({
          id: idx + 1,
          name: item.name || item['اسم المنتج'] || 'منتج غير معروف',
          quantity: parseInt(item.quantity) !== undefined && !isNaN(parseInt(item.quantity)) ? parseInt(item.quantity) : (parseInt(item['الكميه']) || parseInt(item['الكمية']) || 0),
          buyPrice: parseFloat(item.buyPrice) !== undefined && !isNaN(parseFloat(item.buyPrice)) ? parseFloat(item.buyPrice) : (parseFloat(item['سعر الشراء']) || 0),
          wholesalePrice: parseFloat(item.wholesalePrice) !== undefined && !isNaN(parseFloat(item.wholesalePrice)) ? parseFloat(item.wholesalePrice) : (parseFloat(item['سعر البيع']) || 0),
          sellPrice: parseFloat(item.sellPrice) !== undefined && !isNaN(parseFloat(item.sellPrice)) ? parseFloat(item.sellPrice) : (parseFloat(item['سعر المفرد']) || 0),
          price: parseFloat(item.sellPrice) !== undefined && !isNaN(parseFloat(item.sellPrice)) ? parseFloat(item.sellPrice) : (parseFloat(item.price) || 0),
          category: item.category || item['الصنف'] || 'الغذائيات',
          unit: item.category || item['الصنف'] || 'عبوة',
          barcode: String(item.barcode !== undefined ? item.barcode : (item['الباركود'] || '')),
          qty: parseInt(item.quantity) !== undefined && !isNaN(parseInt(item.quantity)) ? parseInt(item.quantity) : (parseInt(item['الكميه']) || parseInt(item['الكمية']) || 0),
          costPrice: parseFloat(item.buyPrice) !== undefined && !isNaN(parseFloat(item.buyPrice)) ? parseFloat(item.buyPrice) : (parseFloat(item['سعر الشراء']) || 0)
        }));

        // Subtract local cart quantities from inventory to reflect unsaved sales
        cart.forEach(cartItem => {
          const prod = inventory.find(p => p.id === cartItem.productId);
          if (prod) {
            prod.qty = Math.max(0, prod.qty - cartItem.qty);
            prod.quantity = Math.max(0, prod.quantity - cartItem.qty);
          }
        });

        products = inventory;
      }

      // Safe mapping for customers
      if (data.customers && Array.isArray(data.customers)) {
        customers = data.customers.map((item, idx) => ({
          id: idx + 1,
          name: item['اسم المحل'] || 'عميل غير معروف',
          address: item['العنوان'] || '',
          phone: String(item['رقم الهاتف'] || ''),
          debt: parseFloat(item['الديون']) || parseFloat(item['الدين']) || 0,
          Latitude: parseFloat(item['Latitude']) || parseFloat(item['latitude']) || parseFloat(item['خط العرض']) || 0,
          Longitude: parseFloat(item['Longitude']) || parseFloat(item['longitude']) || parseFloat(item['خط الطول']) || 0
        }));
      }

      // Safe mapping for sales
      if (data.sales && Array.isArray(data.sales)) {
        salesHistory = data.sales.map((item, idx) => {
          let dateStr = '';
          if (item['تاريخ الفاتورة']) {
            try {
              const d = new Date(item['تاريخ الفاتورة']);
              if (!isNaN(d.getTime())) {
                dateStr = d.toISOString().split('T')[0];
              }
            } catch (e) {
              console.error(e);
            }
          }

          let items = [];
          if (item['تفاصيل المواد']) {
            try {
              items = JSON.parse(item['تفاصيل المواد']);
              if (!Array.isArray(items)) items = [];
            } catch (e) {
              console.error("Failed to parse items details:", e);
            }
          }

          const discountVal = parseFloat(item['الخصم']) || 0;
          const finalTotal = parseFloat(item['المبلغ الإجمالي ']) || parseFloat(item['المبلغ الإجمالي']) || 0;
          const receivedVal = parseFloat(item['المبلغ المستلم']) || 0;
          const subtotalVal = finalTotal + discountVal;

          return {
            id: idx + 1,
            invoiceId: item['رقم الفاتورة'] || ('INV-' + idx),
            date: dateStr,
            customerName: item['اسم العميل'] || 'عميل عام',
            totalAmount: finalTotal,
            subtotal: subtotalVal,
            discount: discountVal,
            receivedAmount: receivedVal,
            status: item['حالة الفاتورة'] || 'مدفوع',
            items: items
          };
        });
      }

      // Safe mapping for purchases
      if (data.purchases && Array.isArray(data.purchases)) {
        purchases = data.purchases.map((item, idx) => {
          let items = [];
          if (item['تفاصيل المواد']) {
            try {
              items = JSON.parse(item['تفاصيل المواد']);
              if (!Array.isArray(items)) items = [];
            } catch (e) {
              console.error("Failed to parse purchase items:", e);
            }
          }

          const finalTotal = parseFloat(item['المبلغ النهائي بعد الخصم']) || parseFloat(item['المبلغ الإجمالي']) || 0;
          const subtotalVal = parseFloat(item['المبلغ الكلي قبل الخصم']) || finalTotal;

          return {
            id: idx + 1,
            invoiceId: item['رقم الفاتورة'] || ('PUR-' + idx),
            companyName: item['اسم الشركة'] || 'شركة جيكور',
            dateTime: item['التاريخ والوقت'] || '',
            totalBeforeDiscount: subtotalVal,
            totalAfterDiscount: finalTotal,
            items: items
          };
        });
      }

      // Safe mapping for suppliers
      if (data.suppliers && Array.isArray(data.suppliers)) {
        suppliers = data.suppliers.map((item, idx) => ({
          id: idx + 1,
          name: item['اسم الشركة'] || item['الاسم'] || 'شركة غير معروفة',
          debt: parseFloat(item['الديون']) || parseFloat(item['الدين']) || parseFloat(item['إجمالي الدين']) || 0
        }));
      }

      // Safe mapping for users
      if (data.users && Array.isArray(data.users)) {
        users = data.users;
      }

      isLoading = false;
      hasError = false;

      // Cache all state to localStorage
      saveAllStatesToLocalStorage();

      // Update active customer profile in-place if modal is open
      if (activeProfileCustomer && !customerProfileModal.classList.contains('hidden')) {
        const updatedCustomer = customers.find(c => c.name === activeProfileCustomer.name || c.id === activeProfileCustomer.id);
        if (updatedCustomer) {
          activeProfileCustomer = updatedCustomer;
          profileCDebt.textContent = `${updatedCustomer.debt.toLocaleString()} د.ع`;
          renderCustomerLedgerView(updatedCustomer);
        }
      }

      renderSalesGrid();
      renderCustomersList();
      renderInventoryList();
      if (typeof populateCheckoutCustomerDropdown === 'function') {
        populateCheckoutCustomerDropdown();
      }

      })
    .catch(err => {
      console.warn("Background fetch sync failed:", err);
      isLoading = false;
      
      if (!runSilently) {
        hasError = true;
        renderSalesGrid();
        renderCustomersList();
        renderInventoryList();
        showArabicToast('فشل تحميل البيانات من السيرفر!', 'error');
      }
      throw err;
    });
};

// --- RENDER COMPONENT: SALES POS GRID ---
const renderSalesGrid = () => {
  if (!salesProductsGrid) return;
  if (isLoading && inventory.length === 0) {
    salesProductsGrid.innerHTML = `
      <div class="col-span-2 text-center py-12">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-[#1e5631] mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">جاري تحميل المنتجات...</span>
      </div>
    `;
    return;
  }
  if (hasError && inventory.length === 0) {
    salesProductsGrid.innerHTML = `
      <div class="col-span-2 text-center py-12">
        <i class="fa-solid fa-circle-exclamation text-2xl text-red-500 mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">فشل في تحميل المنتجات</span>
      </div>
    `;
    return;
  }

  const query = salesSearchBar ? salesSearchBar.value.toLowerCase().trim() : '';
  salesProductsGrid.innerHTML = '';
  
  const filtered = inventory.filter(p => 
    p.name.toLowerCase().includes(query) || 
    (p.barcode && p.barcode.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    salesProductsGrid.innerHTML = `
      <div class="col-span-2 bg-white rounded-2xl border border-gray-100 p-8 text-center clean-shadow">
        <i class="fa-solid fa-box-open text-2xl text-gray-300 mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">المخزن لا يحتوي على منتجات مطابقة</span>
      </div>
    `;
    return;
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  filtered.forEach(prod => {
    const currentThreshold = parseInt(localStorage.getItem('lowStockThreshold')) || 5;
    const card = document.createElement('div');
    card.className = 'bg-white p-4.5 rounded-2xl border border-gray-100 clean-shadow flex flex-col justify-between space-y-3 select-none' + (prod.quantity <= currentThreshold ? ' low-stock-color' : '');
    
    const cartItem = cart.find(c => c.productId === prod.id);
    const cartQty = cartItem ? cartItem.qty : 0;

    let qtyClass = 'text-gray-500';
    if (prod.quantity === 0) qtyClass = 'text-red-500 font-extrabold';
    else if (prod.quantity < 5) qtyClass = 'text-amber-500 font-extrabold';

    card.innerHTML = `
      <div>
        <h4 class="text-xs font-extrabold text-gray-900 line-clamp-2 min-h-[32px]">${prod.name}</h4>
        <div class="mt-2 space-y-1">
          <div class="flex justify-between text-[10px]">
            <span class="text-gray-400">سعر البيع (الجملة):</span>
            <span class="font-extrabold text-[#1e5631]">${(prod.wholesalePrice || 0).toLocaleString()} د.ع</span>
          </div>
          <div class="flex justify-between text-[10px]">
            <span class="text-gray-400">سعر المفرد:</span>
            <span class="font-extrabold text-[#1e5631]">${(prod.sellPrice || 0).toLocaleString()} د.ع</span>
          </div>
          <div class="flex justify-between text-[10px] ${qtyClass}">
            <span>العدد:</span>
            <span>${prod.quantity} ${prod.unit}</span>
          </div>
        </div>
      </div>
      
      <div class="flex items-center justify-between border-t border-gray-50 pt-2.5">
        <button class="btn-dec w-8 h-8 rounded-lg bg-gray-100 text-gray-700 font-black flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors select-none active:scale-90" ${cartQty === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
          <i class="fa-solid fa-minus text-[9px]"></i>
        </button>
        <span class="text-xs font-black text-gray-900 w-6 text-center select-none">${cartQty}</span>
        <button class="btn-inc w-8 h-8 rounded-lg bg-[#1e5631] text-white font-black flex items-center justify-center cursor-pointer hover:bg-[#163e23] transition-colors select-none active:scale-90" ${prod.quantity === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
          <i class="fa-solid fa-plus text-[9px]"></i>
        </button>
      </div>
    `;

    card.dataset.productId = prod.id;
    salesProductsGrid.appendChild(card);
  });
};

// --- HEADER DROPDOWN ACTION ---
const toggleHeaderMenuDropdown = (e) => {
  e.stopPropagation();
  if (headerMenuDropdown.classList.contains('hidden')) {
    openHeaderMenuDropdown();
  } else {
    closeHeaderMenuDropdown();
  }
};

const openHeaderMenuDropdown = () => {
  headerMenuDropdown.classList.remove('hidden');
  setTimeout(() => {
    headerMenuDropdown.classList.remove('opacity-0');
    headerMenuDropdown.classList.remove('scale-95');
    headerMenuDropdown.classList.add('opacity-100');
    headerMenuDropdown.classList.add('scale-100');
  }, 20);
};

const closeHeaderMenuDropdown = () => {
  headerMenuDropdown.classList.remove('opacity-100');
  headerMenuDropdown.classList.remove('scale-100');
  headerMenuDropdown.classList.add('opacity-0');
  headerMenuDropdown.classList.add('scale-95');
  setTimeout(() => {
    headerMenuDropdown.classList.add('hidden');
  }, 200);
};

// --- SALES HISTORY MODAL ACTIONS ---
const getDateLabel = (dateStr) => {
  if (!dateStr) return 'تاريخ غير معروف';
  
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
  
  if (dateStr === todayStr) {
    return 'اليوم';
  } else if (dateStr === yesterdayStr) {
    return 'أمس';
  } else {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const months = [
          'كانون الثاني (يناير)', 'شباط (فبراير)', 'آذار (مارس)', 'نيسان (أبريل)',
          'أيار (مايو)', 'حزيران (يونيو)', 'تموز (يوليو)', 'آب (أغسطس)',
          'أيلول (سبتمبر)', 'تشرين الأول (أكتوبر)', 'تشرين الثاني (نوفمبر)', 'كانون الأول (ديسمبر)'
        ];
        return `${d.getDate()} ${months[d.getMonth()]}`;
      }
    } catch(e) {
      console.error(e);
    }
    return dateStr;
  }
};

const renderSalesHistory = () => {
  salesHistoryList.innerHTML = '';
  
  if (salesHistory.length === 0) {
    salesHistoryList.innerHTML = '<div class="text-center py-8 text-xs text-gray-400">لا يوجد مبيعات مسجلة حتى الآن.</div>';
    return;
  }

  const sorted = [...salesHistory].sort((a, b) => new Date(b.date) - new Date(a.date));

  let lastDateLabel = '';

  sorted.forEach(sale => {
    const dateLabel = getDateLabel(sale.date);
    if (dateLabel !== lastDateLabel) {
      lastDateLabel = dateLabel;
      
      const headerDiv = document.createElement('div');
      headerDiv.className = 'sticky top-0 z-20 bg-gray-50 dark:bg-[#222222] py-2 px-3.5 text-[10px] font-black text-gray-500 dark:text-gray-400 border-b border-gray-150 dark:border-gray-150 select-none shadow-sm rounded-xl mt-4';
      headerDiv.innerHTML = `<i class="fa-solid fa-calendar-day ml-1.5 text-[#1e5631] dark:text-yellow-300"></i> ${dateLabel}`;
      salesHistoryList.appendChild(headerDiv);
    }

    const row = document.createElement('div');
    row.className = 'bg-[#f4f6f5] p-3.5 rounded-xl border border-gray-100 flex justify-between items-center select-none cursor-pointer hover:border-gray-200 transition-all active:scale-[0.98]';
    
    let badgeClass = '';
    if (sale.status === 'مدفوع') badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
    else if (sale.status === 'جزئي') badgeClass = 'bg-amber-50 text-amber-700 border-amber-100';
    else badgeClass = 'bg-red-50 text-red-700 border-red-100';

    row.innerHTML = `
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-extrabold text-gray-900">${sale.customerName}</span>
          <span class="text-[9px] px-2 py-0.5 rounded-full border ${badgeClass} font-black">${sale.status}</span>
        </div>
        <span class="text-[9px] text-gray-400 font-bold block">${sale.date}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs font-black text-[#1e5631] bg-[#e8ecea] px-3 py-1 rounded-lg">
          ${sale.totalAmount.toLocaleString()} د.ع
        </span>
        <button class="btn-print-invoice-action w-7 h-7 rounded-lg bg-white text-gray-500 hover:text-gray-800 flex items-center justify-center border border-gray-200 cursor-pointer transition-colors" title="🖨️ طباعة">
          <i class="fa-solid fa-print text-[10px]"></i>
        </button>
        <button class="btn-whatsapp-invoice-action w-7 h-7 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 flex items-center justify-center cursor-pointer transition-colors" title="💬 واتساب">
          <i class="fa-brands fa-whatsapp text-sm"></i>
        </button>
      </div>
    `;

    row.addEventListener('click', () => {
      openInvoiceDetailsModal(sale);
    });

    row.querySelector('.btn-print-invoice-action').addEventListener('click', (e) => {
      e.stopPropagation();
      const cust = customers.find(c => c.name === sale.customerName);
      if (printSection) {
        printSection.innerHTML = generatePrintReceipt(sale, cust);
      }
      window.print();
    });

    row.querySelector('.btn-whatsapp-invoice-action').addEventListener('click', (e) => {
      e.stopPropagation();
      const cust = customers.find(c => c.name === sale.customerName);
      sendInvoiceWhatsApp(sale, cust);
    });

    salesHistoryList.appendChild(row);
  });
};

const openSalesHistoryModal = () => {
  closeHeaderMenuDropdown();
  renderSalesHistory();
  
  salesHistoryModal.classList.remove('hidden');
  setTimeout(() => {
    salesHistoryModal.classList.remove('opacity-0');
    salesHistoryContent.classList.remove('translate-y-full');
  }, 20);
};

const closeSalesHistoryModal = () => {
  salesHistoryModal.classList.add('opacity-0');
  salesHistoryContent.classList.add('translate-y-full');
  setTimeout(() => {
    salesHistoryModal.classList.add('hidden');
  }, 300);
};

// --- INVOICE DETAILS MODAL ACTIONS ---
const openInvoiceDetailsModal = (invoice) => {
  detailInvoiceId.textContent = getShortInvoiceId(invoice.invoiceId);
  detailInvoiceDate.textContent = invoice.date;
  detailInvoiceCustomer.textContent = invoice.customerName;

  const subtotal = invoice.subtotal || invoice.totalAmount || 0;
  const discount = invoice.discount || 0;
  const total = invoice.totalAmount || 0;
  const received = invoice.receivedAmount || 0;
  const status = invoice.status || 'مدفوع';

  detailInvoiceSubtotal.textContent = `${subtotal.toLocaleString()} د.ع`;
  detailInvoiceDiscount.textContent = `${discount.toLocaleString()} د.ع`;
  detailInvoiceTotal.textContent = `${total.toLocaleString()} د.ع`;
  detailInvoiceReceived.textContent = `${received.toLocaleString()} د.ع`;

  detailInvoiceStatus.textContent = status;
  let badgeClass = '';
  if (status === 'مدفوع') badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
  else if (status === 'جزئي') badgeClass = 'bg-amber-50 text-amber-700 border-amber-100';
  else badgeClass = 'bg-red-50 text-red-700 border-red-100';
  detailInvoiceStatus.className = `px-2.5 py-0.5 rounded-full border text-[9px] font-black ${badgeClass}`;

  detailInvoiceItems.innerHTML = '';
  if (!invoice.items || invoice.items.length === 0) {
    detailInvoiceItems.innerHTML = '<div class="text-center py-4 text-xs text-gray-400">لا توجد تفاصيل للمواد في هذه الفاتورة.</div>';
  } else {
    const header = document.createElement('div');
    header.className = 'grid grid-cols-4 gap-2 text-[10px] font-bold text-gray-500 border-b border-gray-100 pb-1.5 mb-1 select-none';
    header.innerHTML = `
      <span>اسم المادة</span>
      <span class="text-center">العدد</span>
      <span class="text-center">السعر المفرد</span>
      <span class="text-left">المجموع</span>
    `;
    detailInvoiceItems.appendChild(header);

    invoice.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'grid grid-cols-4 gap-2 text-[10px] items-center py-2 border-b border-gray-50 select-none';
      
      const itemTotal = (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0);

      row.innerHTML = `
        <span class="font-extrabold text-gray-800 line-clamp-1">${item.name}</span>
        <span class="text-center text-gray-700 font-bold">${item.qty}</span>
        <span class="text-center text-gray-700">${(parseFloat(item.price) || 0).toLocaleString()}</span>
        <span class="text-left font-black text-[#1e5631]">${itemTotal.toLocaleString()} د.ع</span>
      `;
      detailInvoiceItems.appendChild(row);
    });
  }

  if (detailPrintBtn) {
    detailPrintBtn.onclick = () => {
      const sale = salesHistory.find(s => s.invoiceId === detailInvoiceId.textContent) || salesHistory.find(s => getShortInvoiceId(s.invoiceId) === detailInvoiceId.textContent) || invoice;
      if(!sale) return;
      populateReceiptTemplate(sale);
      const receiptTemplate = document.getElementById('receiptTemplate');
      if (receiptTemplate) {
        document.body.classList.add('thermal-print-mode');
        receiptTemplate.classList.remove('d-none');
        setTimeout(() => {
          window.print();
          receiptTemplate.classList.add('d-none');
          document.body.classList.remove('thermal-print-mode');
        }, 300);
      }
      closeInvoiceDetailsModal();
    };
  }

  if (detailWhatsappBtn) {
    detailWhatsappBtn.onclick = () => {
      const cust = customers.find(c => c.name === invoice.customerName);
      sendInvoiceWhatsApp(invoice, cust);
    };
  }

  invoiceDetailsModal.classList.remove('hidden');
  setTimeout(() => {
    invoiceDetailsModal.classList.remove('opacity-0');
    invoiceDetailsContent.classList.remove('translate-y-full');
  }, 20);
};

const closeInvoiceDetailsModal = () => {
  invoiceDetailsModal.classList.add('opacity-0');
  invoiceDetailsContent.classList.add('translate-y-full');
  setTimeout(() => {
    invoiceDetailsModal.classList.add('hidden');
  }, 300);
};

// --- CUSTOMER PROFILE LEDGER MODAL ACTIONS ---
const getInvoiceDateObj = (sale) => {
  if (sale.invoiceId) {
    const parts = String(sale.invoiceId).split('-');
    if (parts.length > 1) {
      const ms = parseInt(parts[1]);
      if (!isNaN(ms) && ms > 1000000000000 && ms < 3000000000000) {
        return new Date(ms);
      }
    }
  }
  if (sale.date) {
    const d = new Date(sale.date);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }
  return new Date();
};

const formatTime12HourStr = (date) => {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = String(minutes).padStart(2, '0');
  return hours + ':' + minutesStr + ' ' + ampm;
};

const getArabicDateLabel = (dateStr) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  
  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  if (dateStr === todayStr) {
    return 'اليوم';
  } else if (dateStr === yesterdayStr) {
    return 'أمس';
  } else {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      }
    } catch (e) {}
    return dateStr;
  }
};

const getShortInvoiceId = (invoiceId) => {
  if (typeof invoiceId === 'string' && (invoiceId.startsWith('INV-') || invoiceId.startsWith('PAY-')) && invoiceId.includes('-') && invoiceId.split('-')[1].length < 10) {
    return invoiceId;
  }
  const idx = salesHistory.findIndex(s => s.invoiceId === invoiceId);
  if (idx === -1) {
    return invoiceId;
  }
  const sortedSales = [...salesHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
  const sale = salesHistory[idx];
  const isPayment = sale.status === 'تسديد دفعة' || String(sale.invoiceId).startsWith('PAY-');
  
  let count = 0;
  for (let i = 0; i < sortedSales.length; i++) {
    const s = sortedSales[i];
    const sIsPayment = s.status === 'تسديد دفعة' || String(s.invoiceId).startsWith('PAY-');
    if (sIsPayment === isPayment) {
      count++;
    }
    if (s.invoiceId === invoiceId) {
      break;
    }
  }
  const prefix = isPayment ? 'PAY' : 'INV';
  return prefix + '-' + String(count).padStart(3, '0');
};

const getCustomerLedger = (customer) => {
  return salesHistory.filter(sale => sale.customerName === customer.name);
};

const renderCustomerLedgerView = (customer) => {
  profileLedgerList.innerHTML = '';
  const customerSales = getCustomerLedger(customer);

  if (customerSales.length === 0) {
    profileLedgerList.innerHTML = '<div class="text-center py-6 text-xs text-gray-400">لا توجد فواتير مسجلة لهذا العميل.</div>';
  } else {
    customerSales.sort((a, b) => {
      const dateA = getInvoiceDateObj(a);
      const dateB = getInvoiceDateObj(b);
      return dateB - dateA;
    });

    const groups = {};
    customerSales.forEach(sale => {
      const dateStr = sale.date || getInvoiceDateObj(sale).toISOString().split('T')[0];
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(sale);
    });

    Object.keys(groups).forEach(dateStr => {
      const headerDiv = document.createElement('div');
      headerDiv.className = 'sticky top-0 bg-white dark:bg-[#1e1e1e] py-2 px-1 border-b border-gray-100 dark:border-gray-150 text-[10px] font-black text-gray-400 dark:text-gray-500 z-10 select-none';
      headerDiv.innerHTML = '<span>' + getArabicDateLabel(dateStr) + '</span>';
      profileLedgerList.appendChild(headerDiv);

      groups[dateStr].forEach(sale => {
        const row = document.createElement('div');
        
        let badgeClass = '';
        let displayShortId = getShortInvoiceId(sale.invoiceId);
        displayShortId = displayShortId.replace(/\s+/g, '');
        let titleText = 'فاتورة #' + displayShortId;
        let amountClass = 'text-[#1e5631] bg-[#e8ecea] dark:text-[#55c07a] dark:bg-[#1f2e24]';
        let changePrefix = '+ ';
        const timeStr = formatTime12HourStr(getInvoiceDateObj(sale));

        const isPayment = sale.status === 'تسديد دفعة' || String(sale.invoiceId).startsWith('PAY-');

        if (isPayment) {
          badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900';
          titleText = 'تسديد دفعة';
          amountClass = 'text-emerald-700 bg-emerald-50 border border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/20 dark:border-emerald-900';
          changePrefix = '- ';
          
          row.innerHTML = `
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-extrabold text-gray-800 dark:text-gray-200">${titleText}</span>
                <span class="text-[9px] px-2 py-0.5 rounded-full border ${badgeClass} font-black">مدفوع</span>
              </div>
              <span class="text-[9px] text-gray-400 dark:text-gray-500 font-bold block">🕒 ${timeStr}</span>
            </div>
            <span class="text-[10px] font-black ${amountClass} px-3 py-1 rounded-lg">
              ${changePrefix}${sale.totalAmount.toLocaleString()} د.ع
            </span>
          `;
          row.className = 'bg-[#f4f6f5] dark:bg-[#222222] p-3.5 rounded-xl border border-gray-100 dark:border-gray-150 flex justify-between items-center select-none mb-2';
        } else {
          if (sale.status === 'مدفوع') badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900';
          else if (sale.status === 'جزئي') badgeClass = 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-955/20 dark:text-amber-400 dark:border-emerald-900';
          else badgeClass = 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900';
          
          row.innerHTML = `
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-extrabold text-gray-800 dark:text-gray-200">${titleText}</span>
                <span class="text-[9px] px-2 py-0.5 rounded-full border ${badgeClass} font-black">${sale.status}</span>
              </div>
              <span class="text-[9px] text-gray-400 dark:text-gray-505 font-bold block">🕒 ${timeStr}</span>
            </div>
            <span class="text-[10px] font-black ${amountClass} px-3 py-1 rounded-lg">
              ${changePrefix}${sale.totalAmount.toLocaleString()} د.ع
            </span>
          `;
          row.className = 'bg-[#f4f6f5] dark:bg-[#222222] p-3.5 rounded-xl border border-gray-100 dark:border-gray-150 flex justify-between items-center cursor-pointer hover:border-gray-200 dark:hover:border-[#2d2d2d] transition-all active:scale-[0.98] mb-2';

          // Bind Touch Swipe Gestures
          let startX = 0;
          let startY = 0;
          let isSwiping = false;

          row.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isSwiping = false;
            row.dataset.swiped = 'false';
            row.style.transition = 'none';
          }, { passive: true });

          row.addEventListener('touchmove', (e) => {
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = currentX - startX;
            const diffY = currentY - startY;

            if (Math.abs(diffY) > Math.abs(diffX)) {
              return;
            }

            if (Math.abs(diffX) > 10) {
              isSwiping = true;
              row.dataset.swiped = 'true';
              if (e.cancelable) e.preventDefault();
            }

            row.style.transform = 'translateX(' + diffX + 'px)';

            if (diffX > 0) {
              const opacity = Math.min(0.85, diffX / 160);
              row.style.backgroundColor = 'rgba(59, 130, 246, ' + opacity + ')';
              row.style.color = '#ffffff';
            } else {
              const opacity = Math.min(0.85, -diffX / 160);
              row.style.backgroundColor = 'rgba(37, 211, 102, ' + opacity + ')';
              row.style.color = '#ffffff';
            }
          }, { passive: false });

          row.addEventListener('touchend', (e) => {
            row.style.transition = 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.28s ease, color 0.28s ease';
            const finalX = e.changedTouches[0].clientX;
            const diffX = finalX - startX;

            if (isSwiping) {
              if (diffX > 100) {
                row.style.transform = 'translateX(100%)';
                setTimeout(() => {
                  row.style.transform = '';
                  row.style.backgroundColor = '';
                  row.style.color = '';
                  row.dataset.swiped = 'false';
                  
                  const cust = customers.find(c => c.name === sale.customerName);
                  if (printSection) {
                    printSection.innerHTML = generatePrintReceipt(sale, cust);
                  }
                  window.print();
                }, 280);
              } else if (diffX < -100) {
                row.style.transform = 'translateX(-100%)';
                setTimeout(() => {
                  row.style.transform = '';
                  row.style.backgroundColor = '';
                  row.style.color = '';
                  row.dataset.swiped = 'false';

                  const cust = customers.find(c => c.name === sale.customerName);
                  sendInvoiceWhatsApp(sale, cust);
                }, 280);
              } else {
                row.style.transform = '';
                row.style.backgroundColor = '';
                row.style.color = '';
                setTimeout(() => {
                  row.dataset.swiped = 'false';
                }, 50);
              }
            } else {
              row.style.transform = '';
              row.style.backgroundColor = '';
              row.style.color = '';
              row.dataset.swiped = 'false';
            }
          }, { passive: true });

          row.addEventListener('click', () => {
            if (row.dataset.swiped === 'true') return;
            openInvoiceDetailsModal(sale);
          });
        }

        profileLedgerList.appendChild(row);
      });
    });
  }

  customerProfileModal.classList.remove('hidden');
  setTimeout(() => {
    customerProfileModal.classList.remove('opacity-0');
    customerProfileContent.classList.remove('translate-y-full');
  }, 20);
};

const openCustomerProfileModal = (customerId) => {
  const customer = customers.find(c => c.id == customerId);
  if (!customer) return;
  activeProfileCustomer = customer;
  
  if (payDebtFormContainer) payDebtFormContainer.classList.add('hidden');
  if (payDebtAmount) payDebtAmount.value = '';

  profileCName.textContent = customer.name;
  profileCPhone.textContent = customer.phone;
  profileCDebt.textContent = `${customer.debt.toLocaleString()} د.ع`;

  renderCustomerLedgerView(customer);
};

const closeCustomerProfileModal = () => {
  customerProfileModal.classList.add('opacity-0');
  customerProfileContent.classList.add('translate-y-full');
  setTimeout(() => {
    customerProfileModal.classList.add('hidden');
  }, 300);
};

const ledgerModal = document.getElementById('ledgerModal');
const ledgerModalClose = document.getElementById('ledger-modal-close');
const ledgerPrintBtn = document.getElementById('ledger-print-btn');

const openLedgerModal = () => {
  if (ledgerModal) ledgerModal.classList.remove('hidden');
};

const closeLedgerModal = () => {
  if (ledgerModal) ledgerModal.classList.add('hidden');
};

if (ledgerModalClose) {
  ledgerModalClose.addEventListener('click', closeLedgerModal);
}
if (ledgerModal) {
  ledgerModal.addEventListener('click', (e) => {
    if (e.target === ledgerModal) closeLedgerModal();
  });
}
if (ledgerPrintBtn) {
  ledgerPrintBtn.addEventListener('click', () => {
    window.print();
  });
}

const fetchCustomerStatement = async (customerName) => {
  try {
    const statement = salesHistory
      .filter(sale => sale["اسم العميل"] === customerName)
      .map(sale => ({
        invoiceId: sale["رقم الفاتورة"],
        date: sale["تاريخ الفاتورة"],
        customerName: sale["اسم العميل"],
        details: sale["تفاصيل المواد"],
        discount: parseFloat(sale["الخصم"]) || 0,
        totalAmount: parseFloat(sale["المبلغ الإجمالي"]) || 0,
        receivedAmount: parseFloat(sale["المبلغ المستلم"]) || 0,
        status: sale["حالة الفاتورة"] || "مدفوع"
      }));
    return statement;
  } catch (err) {
    console.error("fetchCustomerStatement error:", err);
    showArabicToast('تعذر تحميل كشف الحساب: ' + err.message, 'error');
    return [];
  }
};

const populateLedgerModal = (customer, statement) => {
  const ledgerCustomerName = document.getElementById('ledger-customer-name');
  const ledgerCustomerDebt = document.getElementById('ledger-customer-debt');
  const ledgerTableBody = document.getElementById('ledger-table-body');
  
  if (ledgerCustomerName) ledgerCustomerName.textContent = `اسم العميل: ${customer.name}`;
  if (ledgerCustomerDebt) ledgerCustomerDebt.textContent = `${customer.debt.toLocaleString()} د.ع`;
  
  if (!ledgerTableBody) return;
  ledgerTableBody.innerHTML = '';
  
  if (!statement || statement.length === 0) {
    ledgerTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-400">لا توجد حركات مسجلة في كشف الحساب لهذا العميل.</td></tr>';
    return;
  }
  
  statement.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-gray-100 hover:bg-gray-50 transition-colors';
    
    // Format date cleanly
    let dateStr = row.date || '';
    if (dateStr) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString('ar-IQ');
        }
      } catch (e) {}
    }
    
    const type = row.type || '';
    const invoiceId = row.invoiceId || '';
    const total = parseFloat(row.total) || 0;
    const received = parseFloat(row.received) || 0;
    const details = row.details || '';
    
    tr.innerHTML = `
      <td class="py-2.5 px-3 whitespace-nowrap text-right">${dateStr}</td>
      <td class="py-2.5 px-3 text-right">${type}</td>
      <td class="py-2.5 px-3 text-right font-mono">${invoiceId}</td>
      <td class="py-2.5 px-3 text-right font-bold">${total > 0 ? total.toLocaleString() + ' د.ع' : '-'}</td>
      <td class="py-2.5 px-3 text-right text-emerald-600 font-bold">${received > 0 ? received.toLocaleString() + ' د.ع' : '-'}</td>
      <td class="py-2.5 px-3 text-right max-w-[200px] truncate" title="${details}">${details}</td>
    `;
    ledgerTableBody.appendChild(tr);
  });
};

// --- RENDER COMPONENT: CUSTOMER DIRECTORY ---
const renderCustomersList = () => {
  if (!customersList) return;
  if (isLoading && customers.length === 0) {
    customersList.innerHTML = `
      <div class="text-center py-12">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-[#1e5631] mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">جاري تحميل العملاء...</span>
      </div>
    `;
    return;
  }
  if (hasError && customers.length === 0) {
    customersList.innerHTML = `
      <div class="text-center py-12">
        <i class="fa-solid fa-circle-exclamation text-2xl text-red-505 mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">فشل في تحميل العملاء</span>
      </div>
    `;
    return;
  }

  const customersSearchBar = document.getElementById('customers-search-bar');
  const query = customersSearchBar ? customersSearchBar.value.toLowerCase().trim() : '';
  customersList.innerHTML = '';
  
  const filtered = customers.filter(c => c.name.toLowerCase().includes(query) || c.phone.includes(query));

  if (filtered.length === 0) {
    customersList.innerHTML = `
      <div class="bg-white rounded-2xl border border-gray-100 p-8 text-center clean-shadow">
        <i class="fa-solid fa-users text-2xl text-gray-300 mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">لا يوجد عملاء مطابقين</span>
      </div>
    `;
    return;
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl border border-gray-100 clean-shadow flex flex-col transition-all overflow-hidden select-none';
    
    const debtClass = c.debt > 0 ? 'text-red-500 font-extrabold' : 'text-emerald-500 font-bold';

    const hasGps = c.Latitude && c.Longitude && parseFloat(c.Latitude) !== 0 && parseFloat(c.Longitude) !== 0;
    const gpsBtnClass = hasGps 
      ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200' 
      : 'bg-gray-50 text-gray-400 hover:bg-gray-100 border border-gray-200';
    const gpsBtnTitle = hasGps 
      ? 'تحديث موقع المحل الجغرافي (مسجل حالياً)' 
      : 'تسجيل موقع المحل الجغرافي (غير مسجل)';

    card.innerHTML = `
      <div class="card-header p-4.5 flex justify-between items-center cursor-pointer hover:bg-gray-50/50 transition-colors select-none">
        <div class="flex-grow min-w-0 pr-1 text-right">
          <h4 class="text-xs font-black text-gray-900">${c.name}</h4>
          <div class="text-[10px] text-gray-400 font-bold mt-1">
            <span>الرصيد: </span>
            <span class="${debtClass}">${c.debt.toLocaleString()} د.ع</span>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button class="btn-make-payment px-4 py-2.5 bg-[#1e5631] hover:bg-[#163e23] text-white text-[10px] font-black rounded-xl cursor-pointer transition-all shadow-sm active:scale-95">
            تسديد دفعة
          </button>
          <span class="text-gray-400 text-xs transition-transform duration-200 accordion-arrow">
            <i class="fa-solid fa-chevron-down"></i>
          </span>
        </div>
      </div>

      <div class="accordion-content hidden border-t border-gray-50 bg-[#f8f9fa] dark:bg-[#1a1a1a] p-4.5 space-y-3">
        <div class="grid grid-cols-2 gap-2 text-[10px] text-gray-600 dark:text-gray-400 font-bold">
          <div class="flex items-center gap-1.5 truncate text-right">
            <i class="fa-solid fa-map-location-dot text-gray-400 text-xs"></i>
            <span class="truncate">${c.address || 'لا يوجد عنوان'}</span>
          </div>
          <div class="flex items-center gap-1.5 text-right">
            <i class="fa-solid fa-phone text-gray-400 text-xs"></i>
            <span>${c.phone || 'لا يوجد هاتف'}</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 pt-1">
          <button class="btn-ledger flex-1 min-w-[75px] py-2.5 bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-gray-150 text-gray-700 dark:text-gray-300 text-[9px] font-black rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-[#333333] flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm">
            <i class="fa-solid fa-receipt text-gray-500 dark:text-gray-400"></i> كشف الحساب
          </button>
          <button class="btn-whatsapp py-2.5 px-3 bg-[#25D366]/10 text-[#25D366] text-[9px] font-black rounded-lg cursor-pointer hover:bg-[#25D366]/20 flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm">
            <i class="fa-brands fa-whatsapp text-xs"></i> واتساب
          </button>
          <button class="btn-edit-customer py-2.5 px-3 bg-gray-100 dark:bg-[#2d2d2d] text-gray-700 dark:text-gray-300 text-[9px] font-black rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-[#333333] flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm">
            <i class="fa-solid fa-pen text-[8px]"></i> تعديل
          </button>
          <button class="btn-return-customer py-2.5 px-3 bg-red-50 dark:bg-red-950/20 text-red-500 text-[9px] font-black rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/40 flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm">
            <i class="fa-solid fa-rotate-left text-[8px]"></i> مرتجع
          </button>
          <button class="btn-gps-relocate py-2.5 px-3 ${gpsBtnClass} text-[9px] font-black rounded-lg cursor-pointer flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm" title="${gpsBtnTitle}">
            <i class="fa-solid fa-map-pin text-[8px]"></i> موقع
          </button>
        </div>
      </div>
    `;

    card.dataset.customerId = c.id;
    customersList.appendChild(card);
  });
};

// --- RENDER COMPONENT: INVENTORY STOCKS ---
const renderInventoryList = () => {
  if (!inventoryList) return;
  const totalQty = products.reduce((sum, p) => sum + (parseInt(p.quantity) || 0), 0);
  const countEl = document.getElementById('total-inventory-count');
  if (countEl) countEl.innerText = "إجمالي الكراتين في المخزن: " + totalQty;

  if (isLoading && products.length === 0) {
    inventoryList.innerHTML = `
      <div class="text-center py-12">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-[#1e5631] mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">جاري تحميل المخزون...</span>
      </div>
    `;
    if (salesProductsCount) salesProductsCount.textContent = '...';
    return;
  }
  if (hasError && products.length === 0) {
    inventoryList.innerHTML = `
      <div class="text-center py-12">
        <i class="fa-solid fa-circle-exclamation text-2xl text-red-500 mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">فشل في تحميل المخزون</span>
      </div>
    `;
    if (salesProductsCount) salesProductsCount.textContent = '...';
    return;
  }

  const inventorySearchBar = document.getElementById('inventory-search-bar');
  const query = inventorySearchBar ? inventorySearchBar.value.toLowerCase().trim() : '';
  inventoryList.innerHTML = '';
  
  const filtered = inventory.filter(p => p.name.toLowerCase().includes(query) || (p.barcode && p.barcode.includes(query)));
  if (salesProductsCount) {
    salesProductsCount.textContent = `${filtered.length} منتج`;
  }

  if (filtered.length === 0) {
    inventoryList.innerHTML = `
      <div class="bg-white rounded-2xl border border-gray-100 p-8 text-center clean-shadow">
        <i class="fa-solid fa-cubes text-2xl text-gray-300 mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">لا توجد منتجات مطابقة في المخازن</span>
      </div>
    `;
    return;
  }

  filtered.forEach(p => {
    const currentThreshold = parseInt(localStorage.getItem('lowStockThreshold')) || 5;
    const card = document.createElement('div');
    card.className = 'bg-white p-4.5 rounded-2xl border border-gray-100 clean-shadow flex justify-between items-center gap-3 select-none' + (p.quantity <= currentThreshold ? ' low-stock-color' : '');
    
    card.innerHTML = `
      <div class="space-y-1 flex-1 min-w-0">
        <h4 class="text-xs font-extrabold text-gray-900 truncate">${p.name}</h4>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-gray-450 font-bold">
          <span>شراء (الكلفة): <strong class="text-gray-700">${(p.buyPrice || 0).toLocaleString()} د.ع</strong></span>
          <span>بيع (الجملة): <strong class="text-gray-700">${(p.wholesalePrice || 0).toLocaleString()} د.ع</strong></span>
        </div>
      </div>
      <div class="flex items-center gap-3.5">
        <div class="text-left">
          <span class="text-[9px] text-gray-450 block font-bold">العدد</span>
          <span class="text-xs font-black text-[#1e5631] block">${p.quantity} ${p.unit}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-edit-product w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-800 flex items-center justify-center cursor-pointer transition-colors" title="تعديل المنتج">
            <i class="fa-solid fa-pen text-[10px]"></i>
          </button>
          <button class="btn-delete-product delete-btn w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 flex items-center justify-center cursor-pointer transition-colors" title="حذف المنتج">
            <i class="fa-solid fa-trash-can text-[10px]"></i>
          </button>
        </div>
      </div>
    `;

    card.dataset.productId = p.id;
    inventoryList.appendChild(card);
  });

  applyRBACRules();
};

const renderProductsList = () => {
  renderSalesGrid();
  renderInventoryList();
};

// --- WHATSAPP REDIRECT LINK ---
const triggerWhatsAppRedirect = (phone) => {
  if (!phone) {
    showArabicToast('عذراً، رقم الهاتف غير متوفر!', 'error');
    return;
  }
  const cleanNum = phone.replace(/\D/g, '');
  const url = `https://wa.me/${cleanNum}`;
  showArabicToast('جاري إعادة التوجيه إلى واتساب...', 'info');
  setTimeout(() => {
    window.open(url, '_blank');
  }, 500);
};

// --- CART BADGE & STATE CONTROLS ---
const updateCartBadge = () => {
  const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
  cartBadgeQty.textContent = totalCount;
  
  if (totalCount > 0) {
    cartBadgeQty.classList.remove('scale-0');
    cartBadgeQty.classList.add('scale-100');
  } else {
    cartBadgeQty.classList.remove('scale-100');
    cartBadgeQty.classList.add('scale-0');
  }
};

const renderCartRows = () => {
  cartRowsContainer.innerHTML = '';
  
  if (cart.length === 0) {
    cartRowsContainer.innerHTML = '<div class="text-center py-8 text-xs text-gray-400">سلة المشتريات فارغة حالياً.</div>';
    cartTotalPrice.textContent = '0 د.ع';
    cartQtyIndicator.textContent = '0 قطعة';
    cartCompleteSaleBtn.disabled = true;
    cartCompleteSaleBtn.className = 'w-full py-3.5 bg-white/50 border border-gray-200 text-gray-400 font-bold text-xs rounded-xl cursor-not-allowed select-none';
    return;
  }

  let totalSum = 0;
  let totalItems = 0;

  cart.forEach(item => {
    const prod = inventory.find(p => p.id === item.productId);
    if (!prod) return;

    const rowTotal = prod.price * item.qty;
    totalSum += rowTotal;
    totalItems += item.qty;

    const row = document.createElement('div');
    row.className = 'bg-[#f4f6f5] p-3 rounded-2xl border border-gray-100 flex justify-between items-center';
    row.dataset.productId = item.productId;
    
    row.innerHTML = `
      <div class="space-y-1 flex-1 pr-1">
        <h4 class="text-xs font-extrabold text-gray-800">${prod.name}</h4>
        <span class="text-[10px] text-gray-500 font-bold block">${prod.price.toLocaleString()} د.ع / ${prod.unit}</span>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-dec w-8 h-8 rounded-lg bg-white text-gray-700 font-black flex items-center justify-center border border-gray-200 cursor-pointer active:scale-90 select-none">
          <i class="fa-solid fa-minus text-[10px]"></i>
        </button>
        <span class="text-xs font-black text-gray-900 w-6 text-center select-none">${item.qty}</span>
        <button class="btn-inc w-8 h-8 rounded-lg bg-white text-gray-700 font-black flex items-center justify-center border border-gray-200 cursor-pointer active:scale-90 select-none">
          <i class="fa-solid fa-plus text-[10px]"></i>
        </button>
      </div>
    `;
    cartRowsContainer.appendChild(row);
  });

  cartTotalPrice.textContent = `${totalSum.toLocaleString()} د.ع`;
  cartQtyIndicator.textContent = `${totalItems} قطعة`;
  
  cartCompleteSaleBtn.disabled = false;
  cartCompleteSaleBtn.className = 'w-full py-3.5 bg-[#1e5631] text-white font-bold text-xs rounded-xl hover:bg-[#163e23] transition-all cursor-pointer shadow-md active:scale-98';
};

const animateCartIcon = () => {
  const cartBtn = document.getElementById('header-cart-btn');
  if (cartBtn) {
    cartBtn.classList.remove('cart-pop');
    void cartBtn.offsetWidth;
    cartBtn.classList.add('cart-pop');
    setTimeout(() => {
      cartBtn.classList.remove('cart-pop');
    }, 300);
  }
};

const adjustCartItemQty = (productId, change) => {
  let cartItem = cart.find(c => c.productId === productId);
  const prod = inventory.find(p => p.id === productId);
  if (!prod) return;

  if (change > 0) {
    if (prod.quantity <= 0) {
      showArabicToast('لا يتوفر مخزون إضافي للمنتج!', 'error');
      return;
    }
    if (navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch (err) {
        console.warn("Haptic feedback failed:", err);
      }
    }
    animateCartIcon();
    prod.qty -= 1;
    prod.quantity -= 1;
    if (cartItem) {
      cartItem.qty += 1;
    } else {
      cartItem = { productId: prod.id, qty: 1 };
      cart.push(cartItem);
    }
  } else {
    if (cartItem) {
      prod.qty += 1;
      prod.quantity += 1;
      cartItem.qty -= 1;
      if (cartItem.qty <= 0) {
        cart = cart.filter(c => c.productId !== productId);
      }
    }
  }

  renderCartRows();
  updateCartBadge();
  renderSalesGrid();
  saveCartState();
};
window.adjustCartItemQty = adjustCartItemQty;

// --- MODAL SHEETS ACTIONS ---
const openQuickMenu = () => {
  homeQuickMenu.classList.remove('hidden');
  setTimeout(() => {
    homeQuickMenu.classList.remove('modal-hidden');
    homeQuickMenu.classList.add('modal-visible');
  }, 20);
};

const closeQuickMenu = () => {
  homeQuickMenu.classList.remove('modal-visible');
  homeQuickMenu.classList.add('modal-hidden');
  setTimeout(() => {
    homeQuickMenu.classList.add('hidden');
  }, 220);
};

const openProductModal = () => {
  closeQuickMenu();
  editingProduct = null;
  if (productModalTitle) productModalTitle.textContent = "إضافة منتج جديد";
  if (productSubmitBtn) productSubmitBtn.textContent = "حفظ المنتج";

  const pUnitInput = document.getElementById('p-unit');
  const chipPacket = document.getElementById('p-unit-chip-packet');
  const chipCarton = document.getElementById('p-unit-chip-carton');
  if (pUnitInput && chipPacket && chipCarton) {
    pUnitInput.value = 'عبوة';
    chipPacket.className = 'flex-1 py-3 px-4 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer shadow-sm active:scale-98 bg-[#1e5631] text-white border-[#1e5631]';
    chipCarton.className = 'flex-1 py-3 px-4 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer shadow-sm active:scale-98 bg-gray-50 text-gray-700 border-gray-250 hover:bg-gray-100';
  }

  addProductModal.classList.remove('hidden');
  setTimeout(() => {
    addProductModal.classList.remove('opacity-0');
    addProductContent.classList.remove('translate-y-full');
  }, 20);
};

const closeProductModal = () => {
  addProductModal.classList.add('opacity-0');
  addProductContent.classList.add('translate-y-full');
  setTimeout(() => {
    addProductModal.classList.add('hidden');
  }, 300);
  productForm.reset();
};

// --- PROCUREMENT MODAL ACTIONS ---
const openAddPurchaseModal = () => {
  closeQuickMenu();
  purSupplier.value = 'شركة جيكور';
  purItemQty.value = 1;
  purchaseCart = [];
  
  if (purPaidAmount) {
    delete purPaidAmount.dataset.userEdited;
    purPaidAmount.value = '';
  }
  if (purDebtDisplay) {
    purDebtDisplay.textContent = 'المتبقي كـ دين للشركة: 0 د.ع';
  }
  
  purItemSelect.innerHTML = '';
  const sorted = [...inventory].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  sorted.forEach(prod => {
    const opt = document.createElement('option');
    opt.value = prod.id;
    opt.textContent = `${prod.name} (شراء: ${prod.wholesalePrice.toLocaleString()} د.ع)`;
    purItemSelect.appendChild(opt);
  });
  
  renderPurchaseCart();
  updatePurchaseSummary();
  
  addPurchaseModal.classList.remove('hidden');
  setTimeout(() => {
    addPurchaseModal.classList.remove('opacity-0');
    addPurchaseContent.classList.remove('translate-y-full');
  }, 20);
};

const closeAddPurchaseModal = () => {
  addPurchaseModal.classList.add('opacity-0');
  addPurchaseContent.classList.add('translate-y-full');
  setTimeout(() => {
    addPurchaseModal.classList.add('hidden');
  }, 300);
  purchaseCart = [];
};

const updatePurchaseSummary = () => {
  let subtotal = 0;
  purchaseCart.forEach(item => {
    subtotal += item.price * item.qty;
  });
  const total = subtotal;

  purSummaryBefore.textContent = `${subtotal.toLocaleString()} د.ع`;
  purSummaryAfter.textContent = `${total.toLocaleString()} د.ع`;

  if (purPaidAmount) {
    purPaidAmount.value = total;
    if (purDebtDisplay) {
      purDebtDisplay.textContent = 'المتبقي كـ دين للشركة: 0 د.ع';
    }
  }
};

const renderPurchaseCart = () => {
  purItemsList.innerHTML = '';
  if (purchaseCart.length === 0) {
    purItemsList.innerHTML = '<div class="text-center py-4 text-[10px] text-gray-400 font-bold select-none">لا توجد مواد مضافة بعد.</div>';
    return;
  }
  
  purchaseCart.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'flex justify-between items-center bg-white p-2.5 rounded-lg border border-gray-100 text-[10px]';
    
    const totalVal = item.price * item.qty;
    
    row.innerHTML = `
      <div class="flex-1 pr-1">
        <span class="font-extrabold text-gray-800">${item.name}</span>
        <div class="text-gray-400 font-bold mt-0.5">
          <span>العدد: ${item.qty} | سعر الشراء: ${item.price.toLocaleString()}</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-black text-[#1e5631]">${totalVal.toLocaleString()} د.ع</span>
        <button class="text-red-500 hover:text-red-700 cursor-pointer" onclick="deleteFromPurchaseCart(${idx})">
          <i class="fa-solid fa-trash-can text-[9px]"></i>
        </button>
      </div>
    `;
    purItemsList.appendChild(row);
  });
};

window.deleteFromPurchaseCart = (idx) => {
  purchaseCart.splice(idx, 1);
  renderPurchaseCart();
  updatePurchaseSummary();
};

const openPurchaseHistoryModal = () => {
  closeHeaderMenuDropdown();
  renderPurchaseHistory();
  purchaseHistoryModal.classList.remove('hidden');
  setTimeout(() => {
    purchaseHistoryModal.classList.remove('opacity-0');
    purchaseHistoryContent.classList.remove('translate-y-full');
  }, 20);
};

const closePurchaseHistoryModal = () => {
  purchaseHistoryModal.classList.add('opacity-0');
  purchaseHistoryContent.classList.add('translate-y-full');
  setTimeout(() => {
    purchaseHistoryModal.classList.add('hidden');
  }, 300);
};

const renderPurchaseHistory = () => {
  purchaseHistoryList.innerHTML = '';
  if (purchases.length === 0) {
    purchaseHistoryList.innerHTML = '<div class="text-center py-8 text-xs text-gray-400">لا توجد قوائم مشتريات مسجلة حتى الآن.</div>';
    return;
  }
  
  const sorted = [...purchases].sort((a, b) => b.id - a.id);
  sorted.forEach(pur => {
    const row = document.createElement('div');
    row.className = 'bg-[#f4f6f5] p-3.5 rounded-xl border border-gray-100 flex justify-between items-center select-none cursor-pointer hover:border-[#1e5631] transition-all active:scale-[0.98]';
    
    row.innerHTML = `
      <div class="space-y-1">
        <span class="text-xs font-extrabold text-gray-900 block">${pur.companyName}</span>
        <span class="text-[9px] text-gray-450 font-bold block">${pur.dateTime}</span>
      </div>
      <span class="text-xs font-black text-[#1e5631] bg-[#e8ecea] px-3 py-1 rounded-lg">
        ${pur.totalAfterDiscount.toLocaleString()} د.ع
      </span>
    `;
    
    row.addEventListener('click', () => {
      closePurchaseHistoryModal();
      openPurchaseDetailsModal(pur);
    });
    
    purchaseHistoryList.appendChild(row);
  });
};

const openPurchaseDetailsModal = (pur) => {
  purDetailId.textContent = pur.invoiceId;
  purDetailCompany.textContent = pur.companyName;
  purDetailDatetime.textContent = pur.dateTime;
  
  const subtotal = pur.totalBeforeDiscount || pur.totalAfterDiscount || 0;
  const total = pur.totalAfterDiscount || 0;
  const profit = subtotal - total;
  
  purDetailSubtotal.textContent = `${subtotal.toLocaleString()} د.ع`;
  purDetailProfit.textContent = `${profit.toLocaleString()} د.ع`;
  purDetailTotal.textContent = `${total.toLocaleString()} د.ع`;
  
  purDetailItems.innerHTML = '';
  if (!pur.items || pur.items.length === 0) {
    purDetailItems.innerHTML = '<div class="text-center py-4 text-xs text-gray-400">لا توجد تفاصيل للمواد في هذه القائمة.</div>';
  } else {
    const header = document.createElement('div');
    header.className = 'grid grid-cols-4 gap-2 text-[10px] font-bold text-gray-500 border-b border-gray-100 pb-1.5 mb-1 select-none';
    header.innerHTML = `
      <span>اسم المادة</span>
      <span class="text-center">العدد</span>
      <span class="text-center">السعر المفرد</span>
      <span class="text-left">المجموع</span>
    `;
    purDetailItems.appendChild(header);
    
    pur.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'grid grid-cols-4 gap-2 text-[10px] items-center py-2 border-b border-gray-50 select-none';
      
      const qty = parseInt(item.qty) || 0;
      const price = parseFloat(item.price) || 0;
      const totalVal = qty * price;
      
      row.innerHTML = `
        <span class="font-extrabold text-gray-800 line-clamp-1">${item.name}</span>
        <span class="text-center text-gray-700 font-bold">${qty}</span>
        <span class="text-center text-gray-700">${price.toLocaleString()}</span>
        <span class="text-left font-black text-[#1e5631]">${totalVal.toLocaleString()} د.ع</span>
      `;
      purDetailItems.appendChild(row);
    });
  }
  
  purchaseDetailsModal.classList.remove('hidden');
  setTimeout(() => {
    purchaseDetailsModal.classList.remove('opacity-0');
    purchaseDetailsContent.classList.remove('translate-y-full');
  }, 20);
};

const closePurchaseDetailsModal = () => {
  purchaseDetailsModal.classList.add('opacity-0');
  purchaseDetailsContent.classList.add('translate-y-full');
  setTimeout(() => {
    purchaseDetailsModal.classList.add('hidden');
  }, 300);
};

// --- SUPPLIER ACCOUNTS FUNCTIONS ---
const openSupplierDebtsModal = () => {
  closeHeaderMenuDropdown();
  if (paySupplierFormContainer) paySupplierFormContainer.classList.add('hidden');
  if (paySupplierAmount) paySupplierAmount.value = '';
  
  if (paySupplierSelect) {
    paySupplierSelect.innerHTML = '<option value="">-- اختر الشركة --</option>';
    suppliers.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `${s.name} (الدين: ${s.debt.toLocaleString()} د.ع)`;
      paySupplierSelect.appendChild(opt);
    });
  }
  
  renderSuppliersList();
  
  if (supplierDebtsModal) {
    supplierDebtsModal.classList.remove('hidden');
  }
};

const closeSupplierDebtsModal = () => {
  if (supplierDebtsModal) {
    supplierDebtsModal.classList.add('hidden');
  }
};

const renderSuppliersList = () => {
  if (!suppliersListContainer) return;
  suppliersListContainer.innerHTML = '';
  
  if (suppliers.length === 0) {
    suppliersListContainer.innerHTML = '<div class="text-center py-8 text-xs text-gray-400">لا توجد شركات أو موردين مسجلين حالياً.</div>';
    return;
  }
  
  const sorted = [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  
  sorted.forEach(s => {
    const card = document.createElement('div');
    card.className = 'bg-[#f4f6f5] p-3.5 rounded-xl border border-gray-100 flex justify-between items-center select-none';
    
    const debtClass = s.debt > 0 ? 'text-red-500 font-extrabold' : 'text-emerald-500 font-bold';
    
    card.innerHTML = `
      <div class="space-y-1">
        <h4 class="text-xs font-extrabold text-gray-900">${s.name}</h4>
      </div>
      <div class="text-left">
        <span class="text-[9px] text-gray-450 block font-bold">إجمالي الدين</span>
        <span class="text-xs block ${debtClass}">${s.debt.toLocaleString()} د.ع</span>
      </div>
    `;
    suppliersListContainer.appendChild(card);
  });
};

const openEditProductModal = (product) => {
  editingProduct = product;
  
  if (editPName) editPName.value = product.name;
  if (editPBarcode) editPBarcode.value = product.barcode || '';
  if (editPSell) editPSell.value = product.sellPrice !== undefined ? product.sellPrice : (product.price || 0);
  if (editPBuy) editPBuy.value = product.buyPrice !== undefined ? product.buyPrice : 0;
  if (editPWholesale) editPWholesale.value = product.wholesalePrice !== undefined ? product.wholesalePrice : 0;
  if (editPCategory) editPCategory.value = product.category || 'الغذائيات';
  if (editPQty) editPQty.value = product.quantity;
  if (editPUnitsPerCarton) editPUnitsPerCarton.value = product.unitsPerCarton || '';
  
  if (editProductModal) {
    editProductModal.classList.remove('hidden');
  }
};

const closeEditProductModal = () => {
  if (editProductModal) {
    editProductModal.classList.add('hidden');
  }
};

const openEditCustomerModal = (customer) => {
  editingCustomer = customer;
  
  if (editCName) editCName.value = customer.name;
  if (editCAddress) editCAddress.value = customer.address || '';
  if (editCPhone) editCPhone.value = customer.phone || '';
  if (editCDebtRead) editCDebtRead.textContent = `${customer.debt.toLocaleString()} د.ع`;
  
  if (editCustomerModal) {
    editCustomerModal.classList.remove('hidden');
  }
};

const closeEditCustomerModal = () => {
  if (editCustomerModal) {
    editCustomerModal.classList.add('hidden');
  }
};

const openAddReturnModal = (customer) => {
  activeReturnCustomer = customer;
  if (retCustomerNameDisplay) retCustomerNameDisplay.textContent = customer.name;
  if (retItemQty) retItemQty.value = 1;
  returnCart = [];

  if (retItemSelect) {
    retItemSelect.innerHTML = '';
    const sorted = [...inventory].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    sorted.forEach(prod => {
      const opt = document.createElement('option');
      opt.value = prod.id;
      opt.textContent = `${prod.name} (سعر البيع: ${prod.price.toLocaleString()} د.ع)`;
      retItemSelect.appendChild(opt);
    });
  }

  renderReturnCart();
  updateReturnSummary();

  if (addReturnModal) {
    addReturnModal.classList.remove('hidden');
  }
};

const closeAddReturnModal = () => {
  if (addReturnModal) {
    addReturnModal.classList.add('hidden');
  }
  returnCart = [];
  activeReturnCustomer = null;
};

const renderReturnCart = () => {
  if (!retItemsList) return;
  retItemsList.innerHTML = '';
  if (returnCart.length === 0) {
    retItemsList.innerHTML = '<div class="text-center py-4 text-[10px] text-gray-400 font-bold select-none">لا توجد مواد مضافة بعد.</div>';
    return;
  }

  returnCart.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'flex justify-between items-center bg-white p-2.5 rounded-lg border border-gray-100 text-[10px]';
    const totalVal = item.price * item.qty;

    row.innerHTML = `
      <div class="flex-1 pr-1 text-right">
        <span class="font-extrabold text-gray-800 block">${item.name}</span>
        <div class="text-gray-400 font-bold mt-0.5">
          <span>العدد: ${item.qty} | سعر البيع: ${item.price.toLocaleString()}</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-black text-[#1e5631]">${totalVal.toLocaleString()} د.ع</span>
        <button class="text-red-500 hover:text-red-700 cursor-pointer" onclick="deleteFromReturnCart(${idx})">
          <i class="fa-solid fa-trash-can text-[9px]"></i>
        </button>
      </div>
    `;
    retItemsList.appendChild(row);
  });
};

window.deleteFromReturnCart = (idx) => {
  returnCart.splice(idx, 1);
  renderReturnCart();
  updateReturnSummary();
};

const updateReturnSummary = () => {
  let total = 0;
  returnCart.forEach(item => {
    total += item.price * item.qty;
  });
  if (retSummaryTotal) {
    retSummaryTotal.textContent = `${total.toLocaleString()} د.ع`;
  }
};

const formatIraqiPhone = (phone) => {
  if (!phone) return "";
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("07")) {
    cleaned = "964" + cleaned.substring(1);
  } else if (cleaned.startsWith("7") && cleaned.length === 10) {
    cleaned = "964" + cleaned;
  }
  return cleaned;
};

const openInvoiceOptionsModal = (sale, customer) => {
  lastCompletedSale = sale;
  lastCompletedCustomer = customer;
  if (invoiceOptionsModal) {
    invoiceOptionsModal.classList.remove('hidden');
  }
};

const closeInvoiceOptionsModal = () => {
  if (invoiceOptionsModal) {
    invoiceOptionsModal.classList.add('hidden');
  }
  lastCompletedSale = null;
  lastCompletedCustomer = null;
};

const populateReceiptTemplate = (saleData) => {
  const subtotal = saleData.subtotal || saleData.totalAmount || 0;
  const discount = saleData.discount || 0;
  const netTotal = Math.max(0, subtotal - discount);
  const received = saleData.receivedAmount || 0;
  const remaining = Math.max(0, netTotal - received);

  const titleEl = document.getElementById('recInvoiceTitle');
  if (titleEl) titleEl.innerText = `فاتوره بيع (${saleData.invoiceId})`;

  const typeEl = document.getElementById('recType');
  if (typeEl) typeEl.innerText = remaining > 0 ? 'آجل' : 'نقدا';

  const dateEl = document.getElementById('recDate');
  if (dateEl) dateEl.innerText = saleData.date || new Date().toISOString().split('T')[0];

  const custName = (lastCompletedCustomer && lastCompletedCustomer.name) || saleData.customerName || 'عميل عام';
  const custNameEl = document.getElementById('recCustName');
  if (custNameEl) custNameEl.innerText = custName;

  const itemsBodyEl = document.getElementById('recItemsBody');
  if (itemsBodyEl) {
    let tbodyHtml = '';
    (saleData.items || []).forEach((item, index) => {
      const rowTotal = item.price * item.qty;
      tbodyHtml += `
        <tr>
          <td style="border: 1px solid #000; padding: 2px;">${index + 1}</td>
          <td style="border: 1px solid #000; padding: 2px; text-align: right;">${item.name}</td>
          <td style="border: 1px solid #000; padding: 2px;">${item.price.toLocaleString()}</td>
          <td style="border: 1px solid #000; padding: 2px;">${item.qty}</td>
          <td style="border: 1px solid #000; padding: 2px;">${rowTotal.toLocaleString()}</td>
        </tr>
      `;
    });
    itemsBodyEl.innerHTML = tbodyHtml;
  }

  const totalEl = document.getElementById('recTotal');
  if (totalEl) totalEl.innerText = `${netTotal.toLocaleString()} د.ع`;

  const paidEl = document.getElementById('recPaid');
  if (paidEl) paidEl.innerText = `${received.toLocaleString()} د.ع`;

  const remainingEl = document.getElementById('recRemaining');
  if (remainingEl) remainingEl.innerText = `${remaining.toLocaleString()} د.ع`;

  let currentCustomerDebt = 0;
  if (lastCompletedCustomer) {
    const updatedCust = customers.find(c => c.id === lastCompletedCustomer.id || c.name === lastCompletedCustomer.name);
    if (updatedCust) {
      currentCustomerDebt = updatedCust.debt || 0;
    } else {
      currentCustomerDebt = lastCompletedCustomer.debt || 0;
    }
  }

  const previousDebt = Math.max(0, currentCustomerDebt - remaining);
  const finalDebt = previousDebt + remaining;

  const oldDebtEl = document.getElementById('recOldDebt');
  if (oldDebtEl) oldDebtEl.innerText = `${previousDebt.toLocaleString()} د.ع`;

  const finalDebtEl = document.getElementById('recFinalDebt');
  if (finalDebtEl) finalDebtEl.innerText = `${finalDebt.toLocaleString()} د.ع`;
};

const renderVanTable = () => {
  const tbody = document.getElementById('vanTableBody');
  if (!tbody) return;
  
  let html = '';
  products.forEach(prod => {
    if (!vanStock[prod.name]) {
      vanStock[prod.name] = { loaded: 0, sold: 0, returned: 0, expected: 0 };
    }
    const item = vanStock[prod.name];
    item.loaded = item.loaded || 0;
    item.sold = item.sold || 0;
    item.returned = item.returned || 0;
    item.expected = item.loaded - item.sold + item.returned;
    
    html += `
      <tr class="border-b border-gray-100">
        <td class="py-2.5 px-2 text-right font-bold text-gray-800 text-xs">${prod.name}</td>
        <td class="py-2.5 px-2">
          <input type="number" min="0" value="${item.loaded}" data-product="${prod.name}" class="van-loaded-input w-20 text-center bg-[#f4f6f5] text-gray-800 text-xs px-2 py-1.5 rounded-xl border border-gray-150 focus:outline-none focus:bg-white focus:border-[#1e5631] transition-all font-semibold">
        </td>
        <td class="py-2.5 px-2 font-semibold text-gray-700 text-xs">${item.sold}</td>
        <td class="py-2.5 px-2 font-semibold text-gray-700 text-xs">${item.returned}</td>
        <td class="py-2.5 px-2 font-black text-gray-900 text-xs expected-van-stock">${item.expected}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
};

// Delegated listener for van loaded inputs
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('van-loaded-input')) {
    const productName = e.target.getAttribute('data-product');
    const loadedVal = parseInt(e.target.value) || 0;
    
    vanStock[productName] = vanStock[productName] || { loaded: 0, sold: 0, returned: 0, expected: 0 };
    vanStock[productName].loaded = loadedVal;
    
    const sold = vanStock[productName].sold || 0;
    const returned = vanStock[productName].returned || 0;
    const expected = loadedVal - sold + returned;
    vanStock[productName].expected = expected;
    
    localStorage.setItem('posVanStock', JSON.stringify(vanStock));
    
    const row = e.target.closest('tr');
    if (row) {
      const expectedCell = row.querySelector('.expected-van-stock');
      if (expectedCell) expectedCell.textContent = expected;
    }
  }
});

const generatePrintReceipt = (sale, customer) => {
  const customerName = customer ? customer.name : 'عميل عام';
  const customerPhone = customer && customer.phone ? customer.phone : 'غير متوفر';
  const dateStr = sale.date || new Date().toISOString().split('T')[0];
  
  let itemsHtml = '';
  sale.items.forEach(item => {
    const rowTotal = item.price * item.qty;
    itemsHtml += `
      <tr style="border-bottom: 1px dashed #ccc;">
        <td style="padding: 5px 0; text-align: right;">${item.name}</td>
        <td style="padding: 5px 0; text-align: center;">${item.qty}</td>
        <td style="padding: 5px 0; text-align: center;">${item.price.toLocaleString()}</td>
        <td style="padding: 5px 0; text-align: left;">${rowTotal.toLocaleString()} د.ع</td>
      </tr>
    `;
  });

  const subtotal = sale.subtotal || sale.totalAmount || 0;
  const discount = sale.discount || 0;
  const netTotal = Math.max(0, subtotal - discount);
  const received = sale.receivedAmount || 0;
  const remaining = Math.max(0, netTotal - received);

  return `
    <div style="direction: rtl; font-family: 'Cairo', sans-serif; text-align: center; max-width: 300px; margin: 0 auto; color: #000; padding: 10px;">
      <h2 style="margin: 5px 0; font-size: 18px;">مبيعاتنا</h2>
      <p style="margin: 2px 0; font-size: 11px; color: #555;">وصل مبيعات حراري</p>
      <hr style="border-top: 1px dashed #000; margin: 10px 0;">
      
      <div style="text-align: right; font-size: 11px; line-height: 1.5;">
        <div><strong>رقم الفاتورة:</strong> ${sale.invoiceId}</div>
        <div><strong>التاريخ:</strong> ${dateStr}</div>
        <div><strong>العميل:</strong> ${customerName}</div>
        <div><strong>الهاتف:</strong> ${customerPhone}</div>
      </div>
      
      <hr style="border-top: 1px dashed #000; margin: 10px 0;">
      
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="border-bottom: 1px dashed #000;">
            <th style="text-align: right; padding-bottom: 5px;">المادة</th>
            <th style="text-align: center; padding-bottom: 5px;">العدد</th>
            <th style="text-align: center; padding-bottom: 5px;">السعر</th>
            <th style="text-align: left; padding-bottom: 5px;">المجموع</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <hr style="border-top: 1px dashed #000; margin: 10px 0;">
      
      <div style="text-align: right; font-size: 11px; line-height: 1.6;">
        <div style="display: flex; justify-content: space-between;">
          <span>إجمالي القائمة:</span>
          <span>${subtotal.toLocaleString()} د.ع</span>
        </div>
        ${discount > 0 ? `
        <div style="display: flex; justify-content: space-between;">
          <span>الخصم:</span>
          <span>${discount.toLocaleString()} د.ع</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>المطلوب سداده:</span>
          <span>${netTotal.toLocaleString()} د.ع</span>
        </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between;">
          <span>المبلغ المدفوع:</span>
          <span>${received.toLocaleString()} د.ع</span>
        </div>
        <div style="display: flex; justify-content: space-between; color: red;">
          <span>المتبقي دين للشركة:</span>
          <span>${remaining.toLocaleString()} د.ع</span>
        </div>
      </div>
      
      <hr style="border-top: 1px dashed #000; margin: 10px 0;">
      <p style="font-size: 10px; margin-top: 15px;">شكراً لتعاملكم معنا!</p>
    </div>
  `;
};

const RAWBT_PRINT_WIDTH_PX = 384;

const buildReceiptCanvas = (saleData, customerOverride) => {
  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.width = RAWBT_PRINT_WIDTH_PX;
  const mctx = scratchCanvas.getContext('2d');
  
  const drawReceipt = (ctx) => {
    let y = 10;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, RAWBT_PRINT_WIDTH_PX, 10000);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    
    const fmt = (n) => Math.round(n).toLocaleString('en-US');
    
    const center = (text, fontSize, isBold = true) => {
      ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px Cairo, sans-serif`;
      let textWidth = ctx.measureText(text).width;
      let actualSize = fontSize;
      while (textWidth > RAWBT_PRINT_WIDTH_PX - 30 && actualSize > 12) {
        actualSize -= 1;
        ctx.font = `${isBold ? 'bold ' : ''}${actualSize}px Cairo, sans-serif`;
        textWidth = ctx.measureText(text).width;
      }
      const x = (RAWBT_PRINT_WIDTH_PX - textWidth) / 2;
      ctx.fillText(text, x, y);
      y += actualSize + 8;
    };
    
    const rowLR = (leftText, rightText, fontSize, isBold = true) => {
      ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px Cairo, sans-serif`;
      let leftWidth = ctx.measureText(leftText).width;
      let rightWidth = ctx.measureText(rightText).width;
      let actualSize = fontSize;
      while (leftWidth + rightWidth > RAWBT_PRINT_WIDTH_PX - 30 && actualSize > 12) {
        actualSize -= 1;
        ctx.font = `${isBold ? 'bold ' : ''}${actualSize}px Cairo, sans-serif`;
        leftWidth = ctx.measureText(leftText).width;
        rightWidth = ctx.measureText(rightText).width;
      }
      ctx.textAlign = 'right';
      ctx.fillText(rightText, RAWBT_PRINT_WIDTH_PX - 15, y);
      ctx.textAlign = 'left';
      ctx.fillText(leftText, 15, y);
      ctx.textAlign = 'right';
      y += actualSize + 8;
    };
    
    const dashedLine = () => {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.setLineDash([8, 4]);
      ctx.moveTo(15, y + 2);
      ctx.lineTo(RAWBT_PRINT_WIDTH_PX - 15, y + 2);
      ctx.stroke();
      ctx.setLineDash([]);
      y += 12;
    };
    
    // HEADER SECTION
    center("شركة فستقه للمنتجات الغذائيه المحدوده", 32, true);
    
    let effectiveCustomer = customerOverride;
    if (!effectiveCustomer && saleData.customerName) {
      effectiveCustomer = customers.find(c => c.name === saleData.customerName);
    }
    
    const custName = (effectiveCustomer && effectiveCustomer.name) || saleData.customerName || 'عميل عام';
    center(custName, 26, true);
    
    rowLR(saleData.invoiceId, "رقم الفاتورة:", 22, true);
    
    if (effectiveCustomer && effectiveCustomer.Latitude && effectiveCustomer.Longitude && parseFloat(effectiveCustomer.Latitude) !== 0 && parseFloat(effectiveCustomer.Longitude) !== 0) {
      rowLR(`${effectiveCustomer.Latitude.toFixed(4)}, ${effectiveCustomer.Longitude.toFixed(4)}`, "الموقع:", 22, true);
    }
    
    const now = new Date();
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const dateTimeStr = `${saleData.date || now.toISOString().split('T')[0]} - ${timeStr}`;
    rowLR(dateTimeStr, "التاريخ والوقت:", 22, true);
    
    dashedLine();
    
    // ITEMS TABLE
    (saleData.items || []).forEach(item => {
      ctx.font = 'bold 24px Cairo, sans-serif';
      let nameWidth = ctx.measureText(item.name).width;
      let itemFontSize = 24;
      while (nameWidth > RAWBT_PRINT_WIDTH_PX - 30 && itemFontSize > 14) {
        itemFontSize -= 1;
        ctx.font = `bold ${itemFontSize}px Cairo, sans-serif`;
        nameWidth = ctx.measureText(item.name).width;
      }
      ctx.textAlign = 'right';
      ctx.fillText(item.name, RAWBT_PRINT_WIDTH_PX - 15, y);
      y += itemFontSize + 4;
      
      let qtyText = `العدد: ${item.qty} | السعر المفرد: ${fmt(item.price)} د.ع`;
      const prod = products.find(p => p.name === item.name) || inventory.find(p => p.name === item.name);
      if (prod && prod.unitsPerCarton && prod.unitsPerCarton > 0) {
        qtyText += ` | القطع بالكرتون: ${prod.unitsPerCarton}`;
      }
      
      ctx.font = 'bold 22px Cairo, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(qtyText, RAWBT_PRINT_WIDTH_PX - 15, y);
      y += 26;
      
      const lineTotal = item.price * item.qty;
      rowLR(`${fmt(lineTotal)} د.ع`, "السعر الإجمالي:", 24, true);
      y += 10;
    });
    
    dashedLine();
    
    // FOOTER SECTION
    const subtotal = saleData.subtotal || saleData.totalAmount || 0;
    const discount = saleData.discount || 0;
    const netTotal = Math.max(0, subtotal - discount);
    const received = saleData.receivedAmount || 0;
    const remaining = Math.max(0, netTotal - received);
    
    rowLR(`${fmt(subtotal)} د.ع`, "الإجمالي:", 22, true);
    if (discount > 0) {
      rowLR(`${fmt(discount)} د.ع`, "الخصم:", 22, true);
      rowLR(`${fmt(netTotal)} د.ع`, "المطلوب سداده:", 24, true);
    }
    rowLR(`${fmt(received)} د.ع`, "المدفوع:", 22, true);
    rowLR(`${fmt(remaining)} د.ع`, "المتبقي:", 22, true);
    
    dashedLine();
    
    let currentCustomerDebt = 0;
    if (effectiveCustomer) {
      const updatedCust = customers.find(c => c.id === effectiveCustomer.id || c.name === effectiveCustomer.name);
      if (updatedCust) {
        currentCustomerDebt = updatedCust.debt || 0;
      } else {
        currentCustomerDebt = effectiveCustomer.debt || 0;
      }
    }
    const previousDebt = Math.max(0, currentCustomerDebt - remaining);
    const finalDebt = previousDebt + remaining;
    
    rowLR(`${fmt(previousDebt)} د.ع`, "رصيد سابق:", 24, true);
    rowLR(`${fmt(finalDebt)} د.ع`, "المطلوب سداده:", 24, true);
    
    dashedLine();
    
    center("19/10 JEKOR جيكور", 22, true);
    center("الخطأ والسهو مرجوع للطرفين", 22, true);
    
    y += 20;
    return y;
  };
  
  const height = drawReceipt(mctx);
  
  const canvas = document.createElement('canvas');
  canvas.width = RAWBT_PRINT_WIDTH_PX;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, RAWBT_PRINT_WIDTH_PX, height);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  
  drawReceipt(ctx);
  return canvas;
};

const printThermalViaRawBT = async (saleData, customerOverride) => {
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const canvas = buildReceiptCanvas(saleData, customerOverride);
    sendCanvasToRawBT(canvas);
  } catch (err) {
    console.error("printThermalViaRawBT error:", err);
    showArabicToast("فشل تحضير الطباعة الحرارية", "error");
  }
};

const sendCanvasToRawBT = (canvas) => {
  try {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64Data = dataUrl.split(',')[1];
    const rawbtUrl = "rawbt:data:image/jpeg;base64," + base64Data;
    window.location.href = rawbtUrl;
  } catch (err) {
    console.error("sendCanvasToRawBT error:", err);
    showArabicToast("فشل إرسال الفاتورة إلى طابعة RawBT", "error");
  }
};

const generateWhatsAppMessage = (sale, customer) => {
  const customerName = customer ? customer.name : 'عميل عام';
  
  let itemsText = '';
  sale.items.forEach(item => {
    itemsText += `• ${item.name} × ${item.qty}\n`;
  });
  
  const subtotal = sale.subtotal || sale.totalAmount || 0;
  const discount = sale.discount || 0;
  const finalVal = Math.max(0, subtotal - discount);
  const received = sale.receivedAmount || 0;
  const remaining = Math.max(0, finalVal - received);
  
  let msg = `فاتورة من مبيعاتنا\n`;
  msg += `المحل: ${customerName}\n`;
  msg += `رقم الفاتورة: ${sale.invoiceId}\n`;
  msg += `المواد:\n${itemsText}`;
  msg += `إجمالي القائمة: ${finalVal.toLocaleString()} د.ع\n`;
  msg += `المبلغ المدفوع: ${received.toLocaleString()} د.ع\n`;
  msg += `المتبقي دين: ${remaining.toLocaleString()} د.ع`;
  
  return msg;
};

const sendInvoiceWhatsApp = (sale, customer) => {
  const msg = generateWhatsAppMessage(sale, customer);
  const encodedText = encodeURIComponent(msg);
  const phone = customer ? formatIraqiPhone(customer.phone) : "";
  
  let url = "";
  if (phone) {
    url = `https://wa.me/${phone}?text=${encodedText}`;
  } else {
    url = `https://wa.me/?text=${encodedText}`;
  }
  window.open(url, '_blank');
};

const deleteProduct = async (product) => {
  if (!(await showCustomConfirm(`هل أنت متأكد من حذف المنتج "${product.name}"؟`))) {
    return;
  }

  // State snapshot for rollback
  const snapshot = {
    inventory: JSON.parse(JSON.stringify(inventory)),
    products: JSON.parse(JSON.stringify(products))
  };

  const payload = {
    action: "deleteProduct",
    name: product.name
  };

  // Optimistic UI update
  inventory = inventory.filter(item => item.id !== product.id);
  products = inventory;
  saveAllStatesToLocalStorage();
  
  renderInventoryList();
  renderSalesGrid();
  
  showArabicToast('تم حذف المنتج بنجاح!', 'success');

  if (!navigator.onLine) {
    addToSyncQueue(payload);
  } else {
    (async () => {
      try {
        const bodyPayload = { ...payload, token: APP_SECRET_TOKEN };
        const response = await fetch(BACKEND_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(bodyPayload),
          redirect: 'follow'
        });
        const resData = await response.json();
        if (resData && resData.status === 'error') {
          throw new Error(resData.message || 'Server error');
        }
      } catch (err) {
        console.error("Failed to delete product on server, rolling back:", err);
        inventory = snapshot.inventory;
        products = snapshot.products;
        saveAllStatesToLocalStorage();
        renderInventoryList();
        renderSalesGrid();
        alert("فشل حذف المنتج من السيرفر: " + err.message + "\nتم استعادة المنتج.");
      }
    })();
  }
};

const openCustomerModal = () => {
  closeQuickMenu();
  addCustomerModal.classList.remove('hidden');
  setTimeout(() => {
    addCustomerModal.classList.remove('opacity-0');
    addCustomerContent.classList.remove('translate-y-full');
  }, 20);
};

const closeCustomerModal = () => {
  addCustomerModal.classList.add('opacity-0');
  addCustomerContent.classList.add('translate-y-full');
  setTimeout(() => {
    addCustomerModal.classList.add('hidden');
  }, 300);
  customerForm.reset();
};

const openCartDrawer = () => {
  cartDrawer.classList.remove('hidden');
  renderCartRows();
  setTimeout(() => {
    cartDrawer.classList.remove('modal-hidden');
    cartDrawer.classList.add('modal-visible');
  }, 20);
};

const closeCartDrawer = () => {
  cartDrawer.classList.remove('modal-visible');
  cartDrawer.classList.add('modal-hidden');
  setTimeout(() => {
    cartDrawer.classList.add('hidden');
  }, 220);
};

// --- CHECKOUT PROCESS MODAL ---
const populateCheckoutCustomerDropdown = () => {
  if (!checkoutCustomerSelect) return;
  const currentSelectedValue = checkoutCustomerSelect.value;
  checkoutCustomerSelect.innerHTML = '';
  customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.address})`;
    checkoutCustomerSelect.appendChild(opt);
  });

  if (currentSelectedValue && customers.some(c => c.id == currentSelectedValue)) {
    checkoutCustomerSelect.value = currentSelectedValue;
    const cust = customers.find(c => c.id == currentSelectedValue);
    if (cust && customCustomerDropdownLabel) {
      customCustomerDropdownLabel.textContent = `${cust.name} (${cust.address})`;
    }
  } else if (customers.length > 0) {
    const defaultCust = customers[0];
    checkoutCustomerSelect.value = defaultCust.id;
    if (customCustomerDropdownLabel) {
      customCustomerDropdownLabel.textContent = `${defaultCust.name} (${defaultCust.address})`;
    }
  } else {
    if (customCustomerDropdownLabel) {
      customCustomerDropdownLabel.textContent = "اختر العميل / المحل...";
    }
  }

  if (customCustomerDropdownItems && customCustomerDropdownMenu && !customCustomerDropdownMenu.classList.contains('hidden')) {
    renderCustomCustomerDropdownItems();
  }
};

const openCheckoutModal = (keepQuickAddCustomerState = false) => {
  closeCartDrawer();
  if (keepQuickAddCustomerState !== true) {
    toggleQuickCustomerMode(false);
  }
  
  let sum = 0;
  cart.forEach(item => {
    const prod = inventory.find(p => p.id === item.productId);
    if (prod) sum += prod.price * item.qty;
  });

  checkoutSubtotalVal.textContent = `${sum.toLocaleString()} د.ع`;
  checkoutFinalVal.textContent = `${sum.toLocaleString()} د.ع`;
  
  checkoutDiscount.value = '';
  if (checkoutSavings) checkoutSavings.value = '';
  checkoutReceivedInput.value = '';
  
  updateCheckoutDebtBadge(sum, 0);

  const now = new Date();
  checkoutDateInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  populateCheckoutCustomerDropdown();

  if (customCustomerDropdownMenu) {
    customCustomerDropdownMenu.classList.add('hidden');
  }

  checkoutModal.classList.remove('hidden');
  setTimeout(() => {
    checkoutModal.classList.remove('modal-hidden');
    checkoutModal.classList.add('modal-visible');
  }, 20);

  // Geolocation trigger is now bound directly to checkout complete button click
};

const closeCheckoutModal = () => {
  checkoutModal.classList.remove('modal-visible');
  checkoutModal.classList.add('modal-hidden');
  setTimeout(() => {
    checkoutModal.classList.add('hidden');
  }, 220);

  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  if (document.documentElement) {
    document.documentElement.scrollTop = 0;
  }
};

// --- DYNAMIC CHECKOUT DEBT BADGE CALCULATOR ---
const updateCheckoutDebtBadge = (finalVal, receivedVal) => {
  if (isNaN(receivedVal) || receivedVal <= 0) {
    checkoutDebtBadge.textContent = 'آجل';
    checkoutDebtBadge.className = 'px-3.5 py-2.5 rounded-xl text-xs font-black text-center min-w-[70px] bg-red-50 text-red-700 border border-red-200 select-none';
  } else if (receivedVal < finalVal) {
    checkoutDebtBadge.textContent = 'جزئي';
    checkoutDebtBadge.className = 'px-3.5 py-2.5 rounded-xl text-xs font-black text-center min-w-[70px] bg-amber-50 text-amber-700 border border-amber-200 select-none';
  } else {
    checkoutDebtBadge.textContent = 'مدفوع';
    checkoutDebtBadge.className = 'px-3.5 py-2.5 rounded-xl text-xs font-black text-center min-w-[70px] bg-emerald-50 text-emerald-700 border border-emerald-200 select-none';
  }
};

const getCheckoutPricing = () => {
  let subtotal = 0;
  cart.forEach(item => {
    const prod = inventory.find(p => p.id === item.productId);
    if (prod) subtotal += prod.price * item.qty;
  });

  const discount = parseFloat(checkoutDiscount.value) || 0;
  const finalVal = Math.max(0, subtotal - discount);
  const received = parseFloat(checkoutReceivedInput.value) || 0;

  return { subtotal, finalVal, received };
};

const triggerCheckoutPricingRefresh = () => {
  const { finalVal, received } = getCheckoutPricing();
  checkoutFinalVal.textContent = `${finalVal.toLocaleString()} د.ع`;
  updateCheckoutDebtBadge(finalVal, received);
};

// --- EVENT LISTENERS ---

if (headerMenuBtn) headerMenuBtn.addEventListener('click', toggleHeaderMenuDropdown);
if (menuSalesHistoryBtn) {
  menuSalesHistoryBtn.addEventListener('click', openSalesHistoryModal);
}
if (headerSalesHistoryBtn) {
  headerSalesHistoryBtn.addEventListener('click', openSalesHistoryModal);
}

document.addEventListener('click', () => {
  if (headerMenuDropdown && !headerMenuDropdown.classList.contains('hidden')) {
    closeHeaderMenuDropdown();
  }
});

if (navSales) {
  navSales.addEventListener('click', () => {
    switchView('sales');
  });
}
if (navCustomers) navCustomers.addEventListener('click', () => switchView('customers'));
if (navInventory) navInventory.addEventListener('click', () => switchView('inventory'));

if (customersAddBtnShortcut) customersAddBtnShortcut.addEventListener('click', openCustomerModal);
if (inventoryAddBtnShortcut) inventoryAddBtnShortcut.addEventListener('click', openProductModal);

if (salesSearchBar) {
  salesSearchBar.addEventListener('input', debounce(() => {
    renderSalesGrid();
  }, 300));
}

if (salesProductsGrid) {
  salesProductsGrid.addEventListener('click', (e) => {
    const btnInc = e.target.closest('.btn-inc');
    const btnDec = e.target.closest('.btn-dec');
    if (!btnInc && !btnDec) return;

    const card = e.target.closest('[data-product-id]');
    if (!card) return;

    const prodId = parseInt(card.dataset.productId);
    const prod = inventory.find(p => p.id === prodId);
    if (!prod) return;

    e.stopPropagation();

    if (btnInc) {
      if (prod.quantity > 0) {
        adjustCartItemQty(prod.id, 1);
      } else {
        showArabicToast(`عذراً، منتج "${prod.name}" نفد من المخزن!`, 'error');
      }
    } else if (btnDec) {
      const cartItem = cart.find(c => c.productId === prod.id);
      const cartQty = cartItem ? cartItem.qty : 0;
      if (cartQty > 0) {
        adjustCartItemQty(prod.id, -1);
      }
    }
  });
}

const customersSearchBar = document.getElementById('customers-search-bar');
if (customersSearchBar) {
  customersSearchBar.addEventListener('input', debounce(() => {
    renderCustomersList();
  }, 300));
}

if (customersList) {
  customersList.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-customer-id]');
    if (!card) return;

    const custId = parseInt(card.dataset.customerId);
    const c = customers.find(cust => cust.id === custId);
    if (!c) return;

    const cardHeader = e.target.closest('.card-header');
    const btnMakePayment = e.target.closest('.btn-make-payment');
    const btnLedger = e.target.closest('.btn-ledger');
    const btnGpsRelocate = e.target.closest('.btn-gps-relocate');
    const btnEditCustomer = e.target.closest('.btn-edit-customer');
    const btnReturnCustomer = e.target.closest('.btn-return-customer');
    const btnWhatsapp = e.target.closest('.btn-whatsapp');

    if (cardHeader && !btnMakePayment) {
      const accordionContent = card.querySelector('.accordion-content');
      const arrow = card.querySelector('.accordion-arrow');
      if (accordionContent) {
        const isHidden = accordionContent.classList.toggle('hidden');
        if (arrow) {
          arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
        }
      }
    } else if (btnMakePayment) {
      e.stopPropagation();
      openCustomerProfileModal(c.id);
      if (payDebtFormContainer) {
        payDebtFormContainer.classList.remove('hidden');
        payDebtAmount.value = '';
      }
    } else if (btnLedger) {
      e.stopPropagation();
      const statement = await fetchCustomerStatement(c.name);
      populateLedgerModal(c, statement);
      openLedgerModal();
    } else if (btnGpsRelocate) {
      e.stopPropagation();
      if (await showCustomConfirm("تحديث موقع المحل إلى مكانك الحالي؟")) {
        showArabicToast('جاري تحديد موقع GPS للمحل...', 'info');
        try {
          const gpsVal = await getCurrentLocation();
          let latitude = 0;
          let longitude = 0;
          if (gpsVal) {
            const parts = gpsVal.split(',');
            if (parts.length === 2) {
              latitude = parseFloat(parts[0]) || 0;
              longitude = parseFloat(parts[1]) || 0;
            }
          }
          const updatePayload = {
            action: "updateCustomer",
            oldShopName: c.name,
            shopName: c.name,
            address: c.address,
            phone: c.phone,
            latitude: latitude,
            longitude: longitude
          };
          c.Latitude = latitude;
          c.Longitude = longitude;
          saveAllStatesToLocalStorage();
          renderCustomersList();
          showArabicToast('تم تحديث الموقع الجغرافي للمحل بنجاح!', 'success');
          addToSyncQueue(updatePayload);
        } catch (err) {
          console.error("GPS relocate error:", err);
          showArabicToast("فشل تحديد موقع GPS: " + err.message, "error");
        }
      }
    } else if (btnEditCustomer) {
      e.stopPropagation();
      openEditCustomerModal(c);
    } else if (btnReturnCustomer) {
      e.stopPropagation();
      openAddReturnModal(c);
    } else if (btnWhatsapp) {
      e.stopPropagation();
      triggerWhatsAppRedirect(c.phone);
    }
  });
}

const inventorySearchBar = document.getElementById('inventory-search-bar');
if (inventorySearchBar) {
  inventorySearchBar.addEventListener('input', debounce(() => {
    renderInventoryList();
  }, 300));
}

if (inventoryList) {
  inventoryList.addEventListener('click', (e) => {
    const btnEdit = e.target.closest('.btn-edit-product');
    const btnDelete = e.target.closest('.btn-delete-product');
    if (!btnEdit && !btnDelete) return;

    const card = e.target.closest('[data-product-id]');
    if (!card) return;

    const prodId = parseInt(card.dataset.productId);
    const prod = inventory.find(p => p.id === prodId);
    if (!prod) return;

    e.stopPropagation();

    if (btnEdit) {
      openEditProductModal(prod);
    } else if (btnDelete) {
      deleteProduct(prod);
    }
  });
}

const btnArchiveDb = document.getElementById('btnArchiveDb');
if (btnArchiveDb) {
  btnArchiveDb.addEventListener('click', async () => {
    const doubleCheck = confirm("⚠️ تحذير هام جداً: هل أنت متأكد من رغبتك في إقفال السنة المالية وأرشفة جميع السجلات؟ هذا الإجراء سيؤدي إلى ترحيل السجلات الحالية ولا يمكن التراجع عنه!");
    if (!doubleCheck) return;

    try {
      showArabicToast('جاري أرشفة البيانات وإقفال السنة المالية...', 'info');
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: "archiveData",
          token: APP_SECRET_TOKEN
        }),
        redirect: 'follow'
      });
      const resData = await response.json();
      if (resData && resData.status === 'success') {
        showArabicToast('تم إقفال السنة المالية وأرشفة السجلات بنجاح!', 'success');
        await fetchData(true);
      } else {
        alert("فشل في الأرشفة: " + (resData ? resData.message : "خطأ غير معروف"));
      }
    } catch (err) {
      console.error("Archive request failed:", err);
      alert("حدث خطأ أثناء الاتصال بالسيرفر لإجراء الأرشفة.");
    }
  });
}

const btnArchiveSearch = document.getElementById('btn-archive-search');
const archiveSearchInput = document.getElementById('archive-search-input');

if (btnArchiveSearch) {
  btnArchiveSearch.addEventListener('click', async () => {
    const val = archiveSearchInput ? archiveSearchInput.value.trim() : '';
    if (!val) {
      renderSalesHistory();
      return;
    }
    
    const isInv = val.toUpperCase().startsWith('INV-') || val.toUpperCase().startsWith('RET-') || val.toUpperCase().startsWith('PUR-');
    const invoiceId = isInv ? val : '';
    const query = isInv ? '' : val;
    
    showArabicToast('جاري البحث في الأرشيف...', 'info');
    const results = await searchArchive(invoiceId, query);
    renderArchiveResults(results);
  });
}

if (archiveSearchInput) {
  archiveSearchInput.addEventListener('input', (e) => {
    if (!e.target.value.trim()) {
      renderSalesHistory();
    }
  });
}

if (headerAddBtn) headerAddBtn.addEventListener('click', openQuickMenu);
if (quickMenuDismiss) quickMenuDismiss.addEventListener('click', closeQuickMenu);
if (quickMenuClose) quickMenuClose.addEventListener('click', closeQuickMenu);

if (quickAddProduct) quickAddProduct.addEventListener('click', openProductModal);
if (quickAddCustomer) quickAddCustomer.addEventListener('click', openCustomerModal);

if (addProductDismiss) addProductDismiss.addEventListener('click', closeProductModal);
if (addProductClose) addProductClose.addEventListener('click', closeProductModal);

if (addCustomerDismiss) addCustomerDismiss.addEventListener('click', closeCustomerModal);
if (addCustomerClose) addCustomerClose.addEventListener('click', closeCustomerModal);

if (headerCartBtn) headerCartBtn.addEventListener('click', openCartDrawer);
if (cartDrawerDismiss) cartDrawerDismiss.addEventListener('click', closeCartDrawer);
if (cartDrawerClose) cartDrawerClose.addEventListener('click', closeCartDrawer);

if (cartRowsContainer) {
  cartRowsContainer.addEventListener('click', (e) => {
    const btnInc = e.target.closest('.btn-inc');
    const btnDec = e.target.closest('.btn-dec');
    if (!btnInc && !btnDec) return;

    const row = e.target.closest('[data-product-id]');
    if (!row) return;

    const prodId = parseInt(row.dataset.productId);
    e.stopPropagation();

    if (btnInc) {
      adjustCartItemQty(prodId, 1);
    } else if (btnDec) {
      adjustCartItemQty(prodId, -1);
    }
  });
}

if (checkoutDismiss) checkoutDismiss.addEventListener('click', closeCheckoutModal);
if (checkoutClose) checkoutClose.addEventListener('click', closeCheckoutModal);

if (salesHistoryDismiss) salesHistoryDismiss.addEventListener('click', closeSalesHistoryModal);
if (salesHistoryClose) salesHistoryClose.addEventListener('click', closeSalesHistoryModal);

if (customerProfileDismiss) customerProfileDismiss.addEventListener('click', closeCustomerProfileModal);
if (customerProfileClose) customerProfileClose.addEventListener('click', closeCustomerProfileModal);

if (menuSupplierDebtsBtn) menuSupplierDebtsBtn.addEventListener('click', openSupplierDebtsModal);
if (supplierDebtsClose) supplierDebtsClose.addEventListener('click', closeSupplierDebtsModal);
if (editProductClose) editProductClose.addEventListener('click', closeEditProductModal);
if (editCustomerClose) editCustomerClose.addEventListener('click', closeEditCustomerModal);

if (paySupplierToggleBtn) {
  paySupplierToggleBtn.addEventListener('click', () => {
    if (paySupplierFormContainer) {
      paySupplierFormContainer.classList.toggle('hidden');
      if (!paySupplierFormContainer.classList.contains('hidden')) {
        paySupplierAmount.value = '';
      }
    }
  });
}

if (paySupplierCancel) {
  paySupplierCancel.addEventListener('click', () => {
    if (paySupplierFormContainer) {
      paySupplierFormContainer.classList.add('hidden');
    }
  });
}

if (paySupplierSubmit) {
  paySupplierSubmit.addEventListener('click', async () => {
    const companyName = paySupplierSelect.value;
    const paidAmount = parseFloat(paySupplierAmount.value);
    if (!companyName || isNaN(paidAmount) || paidAmount <= 0) {
      showArabicToast('الرجاء اختيار الشركة وإدخال مبلغ مسدد صحيح', 'error');
      return;
    }

    const payload = {
      action: "paySupplier",
      invoiceId: "PAY-" + Date.now(),
      companyName: companyName,
      dateTime: new Date().toLocaleString('ar-IQ'),
      amount: paidAmount
    };

    const supp = suppliers.find(s => s.name === companyName);
    if (supp) {
      supp.debt = Math.max(0, supp.debt - paidAmount);
    }
    
    paySupplierAmount.value = '';
    if (paySupplierFormContainer) {
      paySupplierFormContainer.classList.add('hidden');
    }
    
    saveAllStatesToLocalStorage();
    renderSuppliersList();
    openSupplierDebtsModal();
    
    showArabicToast("تم تسجيل الدفعة وتخفيض الدين بنجاح!", "success");
    addToSyncQueue(payload);
  });
}

if (purPaidAmount) {
  purPaidAmount.addEventListener('input', () => {
    purPaidAmount.dataset.userEdited = 'true';
    const subtotal = purchaseCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const total = subtotal;
    const paidVal = parseFloat(purPaidAmount.value) || 0;
    const remaining = Math.max(0, total - paidVal);
    if (purDebtDisplay) {
      purDebtDisplay.textContent = `المتبقي كـ دين للشركة: ${remaining.toLocaleString()} د.ع`;
    }
  });
}

if (profilePayDebtBtn) {
  profilePayDebtBtn.addEventListener('click', () => {
    if (payDebtFormContainer) {
      payDebtFormContainer.classList.toggle('hidden');
      if (!payDebtFormContainer.classList.contains('hidden')) {
        payDebtAmount.value = '';
      }
    }
  });
}

if (payDebtCancel) {
  payDebtCancel.addEventListener('click', () => {
    if (payDebtFormContainer) {
      payDebtFormContainer.classList.add('hidden');
    }
  });
}

if (payDebtSubmit) {
  payDebtSubmit.addEventListener('click', async () => {
    if (!activeProfileCustomer) return;
    const amount = parseFloat(payDebtAmount.value);
    if (isNaN(amount) || amount <= 0) {
      showArabicToast('الرجاء إدخال مبلغ صحيح', 'error');
      return;
    }

    const customerName = activeProfileCustomer.name;
    const invoiceId = "PAY-" + Date.now();
    const dateStr = new Date().toISOString().split('T')[0];

    const payload = {
      action: "recordPayment",
      invoiceId: invoiceId,
      customerName: customerName,
      date: dateStr,
      amount: amount
    };

    activeProfileCustomer.debt = Math.max(0, activeProfileCustomer.debt - amount);
    const cIdx = customers.findIndex(c => c.id === activeProfileCustomer.id);
    if (cIdx !== -1) {
      customers[cIdx].debt = activeProfileCustomer.debt;
    }

    salesHistory.push({
      id: salesHistory.length > 0 ? Math.max(...salesHistory.map(s => s.id)) + 1 : 1,
      invoiceId: invoiceId,
      date: dateStr,
      customerName: customerName,
      totalAmount: amount,
      subtotal: amount,
      discount: 0,
      receivedAmount: amount,
      status: 'تسديد دفعة',
      items: []
    });

    profileCDebt.textContent = `${activeProfileCustomer.debt.toLocaleString()} د.ع`;
    renderCustomerLedgerView(activeProfileCustomer);
    renderCustomersList();
    
    if (payDebtFormContainer) {
      payDebtFormContainer.classList.add('hidden');
    }
    payDebtAmount.value = '';
    
    saveAllStatesToLocalStorage();
    showArabicToast('تم تسجيل عملية التسديد بنجاح!', 'success');
    addToSyncQueue(payload);
  });
}

if (invoiceDetailsDismiss) invoiceDetailsDismiss.addEventListener('click', closeInvoiceDetailsModal);
if (invoiceDetailsClose) invoiceDetailsClose.addEventListener('click', closeInvoiceDetailsModal);

if (headerPurchaseBtn) {
  headerPurchaseBtn.addEventListener('click', openAddPurchaseModal);
}
if (menuPurchaseHistoryBtn) {
  menuPurchaseHistoryBtn.addEventListener('click', openPurchaseHistoryModal);
}

if (addPurchaseDismiss) addPurchaseDismiss.addEventListener('click', closeAddPurchaseModal);
if (addPurchaseClose) addPurchaseClose.addEventListener('click', closeAddPurchaseModal);

if (purchaseHistoryDismiss) purchaseHistoryDismiss.addEventListener('click', closePurchaseHistoryModal);
if (purchaseHistoryClose) purchaseHistoryClose.addEventListener('click', closePurchaseHistoryModal);

if (purchaseDetailsDismiss) purchaseDetailsDismiss.addEventListener('click', closePurchaseDetailsModal);
if (purchaseDetailsClose) purchaseDetailsClose.addEventListener('click', closePurchaseDetailsModal);

if (purAddItemBtn) {
  purAddItemBtn.addEventListener('click', () => {
    const prodId = parseInt(purItemSelect.value);
    const qty = parseInt(purItemQty.value) || 0;
    if (!prodId || qty <= 0) {
      showArabicToast('الرجاء اختيار المادة وتحديد كمية صحيحة', 'error');
      return;
    }
    const prod = inventory.find(p => p.id === prodId);
    if (!prod) return;
    
    const existing = purchaseCart.find(item => item.productId === prod.id);
    if (existing) {
      existing.qty += qty;
    } else {
      purchaseCart.push({
        productId: prod.id,
        name: prod.name,
        qty: qty,
        price: prod.wholesalePrice
      });
    }
    
    purItemQty.value = 1;
    renderPurchaseCart();
    updatePurchaseSummary();
  });
}

if (purSubmitBtn) {
  purSubmitBtn.addEventListener('click', async () => {
    if (purchaseCart.length === 0) {
      showArabicToast('الرجاء إضافة مواد أولاً إلى القائمة', 'error');
      return;
    }
    const companyName = purSupplier.value.trim() || 'شركة جيكور';
    
    let subtotal = 0;
    purchaseCart.forEach(item => {
      subtotal += item.price * item.qty;
    });
    const total = subtotal;
    const paidAmount = total;
    
    const invoiceId = "PUR-" + Date.now();
    const dateTime = new Date().toLocaleString('ar-IQ');
    
    const payloadItems = purchaseCart.map(item => ({
      name: item.name,
      qty: item.qty,
      price: item.price
    }));
    
    const payload = {
      action: "addPurchase",
      invoiceId: invoiceId,
      companyName: companyName,
      dateTime: dateTime,
      totalBeforeDiscount: subtotal,
      totalAfterDiscount: total,
      paidAmount: paidAmount,
      items: payloadItems
    };

    purchaseCart.forEach(item => {
      const prod = inventory.find(p => p.id === item.productId);
      if (prod) {
        prod.qty += item.qty;
        prod.quantity += item.qty;
      }
    });
    
    purchases.push({
      id: purchases.length > 0 ? Math.max(...purchases.map(p => p.id)) + 1 : 1,
      invoiceId: invoiceId,
      companyName: companyName,
      dateTime: dateTime,
      totalBeforeDiscount: subtotal,
      totalAfterDiscount: total,
      paidAmount: paidAmount,
      items: payloadItems
    });
    
    saveAllStatesToLocalStorage();
    purchaseCart = [];
    closeAddPurchaseModal();
    renderSalesGrid();
    renderInventoryList();
    
    showArabicToast('تم تسجيل عملية الشراء وتحديث المخزن بنجاح!', 'success');
    if (!navigator.onLine) {
      syncQueue.push({
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        payload: payload
      });
      localStorage.setItem('posSyncQueue', JSON.stringify(syncQueue));
      showArabicToast("تم حفظ العملية محلياً (بدون إنترنت) وسيتم رفعها تلقائياً عند عودة الاتصال", "info");
    } else {
      (async () => {
        try {
          const bodyPayload = { ...payload, token: APP_SECRET_TOKEN };
          const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(bodyPayload),
            redirect: 'follow'
          });
          const resData = await response.json();
          if (resData && resData.status === 'error') {
            throw new Error(resData.message || 'Server error');
          }
          console.log("Purchase synced successfully:", invoiceId);
        } catch (err) {
          console.warn("Failed to sync purchase, queuing offline:", err);
          syncQueue.push({
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            payload: payload
          });
          localStorage.setItem('posSyncQueue', JSON.stringify(syncQueue));
          showArabicToast("تم حفظ العملية محلياً (بدون إنترنت) وسيتم رفعها تلقائياً عند عودة الاتصال", "info");
        }
      })();
    }
  });
}

if (addReturnClose) {
  addReturnClose.addEventListener('click', closeAddReturnModal);
}

if (retAddItemBtn) {
  retAddItemBtn.addEventListener('click', () => {
    const prodId = parseInt(retItemSelect.value);
    const qty = parseInt(retItemQty.value) || 0;
    if (!prodId || qty <= 0) {
      showArabicToast('الرجاء اختيار المادة وتحديد كمية صحيحة', 'error');
      return;
    }
    const prod = inventory.find(p => p.id === prodId);
    if (!prod) return;
    
    const existing = returnCart.find(item => item.productId === prod.id);
    if (existing) {
      existing.qty += qty;
    } else {
      returnCart.push({
        productId: prod.id,
        name: prod.name,
        qty: qty,
        price: prod.price
      });
    }
    
    retItemQty.value = 1;
    renderReturnCart();
    updateReturnSummary();
  });
}

if (retSubmitBtn) {
  retSubmitBtn.addEventListener('click', async () => {
    if (!activeReturnCustomer) return;
    if (returnCart.length === 0) {
      showArabicToast('الرجاء إضافة مواد أولاً إلى القائمة', 'error');
      return;
    }
    const customerName = activeReturnCustomer.name;
    const returnId = "RET-" + Date.now();
    const dateTime = new Date().toLocaleString('ar-IQ');
    const selectedMethod = retRefundMethod.value;
    
    let grandTotal = 0;
    returnCart.forEach(item => {
      grandTotal += item.price * item.qty;
    });
    
    const payloadItems = returnCart.map(item => ({
      name: item.name,
      qty: item.qty,
      price: item.price
    }));
    
    const payload = {
      action: "addReturn",
      returnId: returnId,
      customerName: customerName,
      dateTime: dateTime,
      totalAmount: grandTotal,
      refundMethod: selectedMethod,
      items: payloadItems
    };

    returnCart.forEach(item => {
      const prod = inventory.find(p => p.id === item.productId);
      if (prod) {
        prod.qty += item.qty;
        prod.quantity += item.qty;
      }
    });
    
    if (selectedMethod === "خصم من الدين") {
      const cust = customers.find(c => c.id === activeReturnCustomer.id);
      if (cust) {
        cust.debt = Math.max(0, cust.debt - grandTotal);
      }
    }

    if (localStorage.getItem('vanModeEnabled') === 'true') {
      payloadItems.forEach(item => {
        vanStock[item.name] = vanStock[item.name] || { loaded: 0, sold: 0, returned: 0, expected: 0 };
        vanStock[item.name].returned = (vanStock[item.name].returned || 0) + parseInt(item.qty);
        vanStock[item.name].expected = (vanStock[item.name].loaded || 0) - (vanStock[item.name].sold || 0) + vanStock[item.name].returned;
      });
      localStorage.setItem('posVanStock', JSON.stringify(vanStock));
    }

    saveAllStatesToLocalStorage();
    closeAddReturnModal();
    showArabicToast("تم تسجيل المرتجع وتحديث المخزن بنجاح!", "success");
    renderCustomersList();
    renderInventoryList();
    renderSalesGrid();

    if (!navigator.onLine) {
      syncQueue.push({
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        payload: payload
      });
      localStorage.setItem('posSyncQueue', JSON.stringify(syncQueue));
      showArabicToast("تم حفظ العملية محلياً (بدون إنترنت) وسيتم رفعها تلقائياً عند عودة الاتصال", "info");
    } else {
      (async () => {
        try {
          const bodyPayload = { ...payload, token: APP_SECRET_TOKEN };
          const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(bodyPayload),
            redirect: 'follow'
          });
          const resData = await response.json();
          if (resData && resData.status === 'error') {
            throw new Error(resData.message || 'Server error');
          }
          console.log("Return synced successfully:", returnId);
        } catch (err) {
          console.warn("Failed to sync return, queuing offline:", err);
          syncQueue.push({
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            payload: payload
          });
          localStorage.setItem('posSyncQueue', JSON.stringify(syncQueue));
          showArabicToast("تم حفظ العملية محلياً (بدون إنترنت) وسيتم رفعها تلقائياً عند عودة الاتصال", "info");
        }
      })();
    }
  });
}

if (checkoutDiscount) checkoutDiscount.addEventListener('input', triggerCheckoutPricingRefresh);
if (checkoutReceivedInput) checkoutReceivedInput.addEventListener('input', triggerCheckoutPricingRefresh);

if (cWhatsAppBtn) {
  cWhatsAppBtn.addEventListener('click', () => {
    const phoneVal = document.getElementById('c-phone') ? document.getElementById('c-phone').value.trim() : '';
    triggerWhatsAppRedirect(phoneVal);
  });
}

// SUBMIT: SAVE PRODUCT FORM (ADD NEW PRODUCT ONLY)
if (productForm) {
  productForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('p-name').value.trim();
    const barcode = document.getElementById('p-barcode').value.trim();
    const buyPrice = parseFloat(document.getElementById('p-buy').value) || 0;
    const wholesalePrice = parseFloat(document.getElementById('p-wholesale').value) || 0;
    const sellPrice = parseFloat(document.getElementById('p-sell').value) || 0;
    const unit = document.getElementById('p-unit').value;
    const qty = parseInt(document.getElementById('p-qty').value) || 0;
    const unitsPerCarton = parseInt(document.getElementById('p-units-per-carton').value) || 0;

    if (!name || isNaN(sellPrice) || isNaN(wholesalePrice) || isNaN(buyPrice)) {
      showArabicToast('الرجاء إدخال الحقول المطلوبة بشكل صحيح', 'error');
      return;
    }

    if (!unitsPerCarton || unitsPerCarton < 1) {
      showArabicToast('الرجاء إدخال عدد القطع داخل الكرتون (الباكيت)', 'error');
      return;
    }

    const newProd = {
      id: inventory.length > 0 ? Math.max(...inventory.map(p => p.id)) + 1 : 1,
      name,
      quantity: qty,
      qty,
      price: sellPrice,
      sellPrice: sellPrice,
      wholesalePrice: wholesalePrice,
      buyPrice: buyPrice,
      costPrice: buyPrice,
      category: 'الغذائيات',
      unit,
      barcode,
      unitsPerCarton
    };

    inventory.push(newProd);

    const payload = {
      action: "addProduct",
      name: name,
      barcode: barcode,
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      wholesalePrice: wholesalePrice,
      category: unit,
      quantity: qty,
      unitsPerCarton: unitsPerCarton
    };

    saveAllStatesToLocalStorage();
    productForm.reset();
    closeProductModal();
    showArabicToast('تم حفظ المنتج بنجاح!', 'success');
    renderSalesGrid();
    renderInventoryList();

    addToSyncQueue(payload);
  });
}

// SUBMIT: EDIT PRODUCT FORM (UPDATE PRODUCT)
if (editProductForm) {
  editProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingProduct) return;

    const originalName = editingProduct.name;
    const name = editPName.value.trim();
    const barcode = editPBarcode.value.trim();
    const buyPrice = parseFloat(editPBuy.value) || 0;
    const wholesalePrice = parseFloat(editPWholesale.value) || 0;
    const sellPrice = parseFloat(editPSell.value) || 0;
    const category = editPCategory.value.trim();
    const quantity = parseInt(editPQty.value) || 0;
    const unitsPerCarton = parseInt(editPUnitsPerCarton.value) || 0;

    if (!name || isNaN(sellPrice) || isNaN(wholesalePrice) || isNaN(buyPrice) || !category) {
      showArabicToast('الرجاء إدخال الحقول المطلوبة بشكل صحيح', 'error');
      return;
    }

    if (!unitsPerCarton || unitsPerCarton < 1) {
      showArabicToast('الرجاء إدخال عدد القطع داخل الكرتون (الباكيت)', 'error');
      return;
    }

    const payload = {
      action: "updateProduct",
      oldName: originalName,
      name: name,
      barcode: barcode,
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      wholesalePrice: wholesalePrice,
      category: category,
      quantity: quantity,
      unitsPerCarton: unitsPerCarton
    };

    editingProduct.name = name;
    editingProduct.barcode = barcode;
    editingProduct.sellPrice = sellPrice;
    editingProduct.price = sellPrice;
    editingProduct.wholesalePrice = wholesalePrice;
    editingProduct.buyPrice = buyPrice;
    editingProduct.costPrice = buyPrice;
    editingProduct.category = category;
    editingProduct.unit = category;
    editingProduct.qty = quantity;
    editingProduct.quantity = quantity;
    editingProduct.unitsPerCarton = unitsPerCarton;

    editingProduct = null;
    editProductForm.reset();
    closeEditProductModal();
    showArabicToast('تم تعديل المادة بنجاح!', 'success');
    renderSalesGrid();
    renderInventoryList();

    saveAllStatesToLocalStorage();
    addToSyncQueue(payload);
  });
}

// SUBMIT: EDIT CUSTOMER FORM (UPDATE CUSTOMER)
if (editCustomerForm) {
  editCustomerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingCustomer) return;

    const originalShopName = editingCustomer.name;
    const newShopName = editCName.value.trim();
    const address = editCAddress.value.trim();
    const phone = editCPhone.value.trim();

    if (!newShopName || !address || !phone) {
      showArabicToast('الرجاء إدخال كافة الحقول المطلوبة', 'error');
      return;
    }

    const payload = {
      action: "updateCustomer",
      oldShopName: originalShopName,
      shopName: newShopName,
      address: address,
      phone: phone,
      latitude: parseFloat(editingCustomer.Latitude) || 0,
      longitude: parseFloat(editingCustomer.Longitude) || 0
    };

    editingCustomer.name = newShopName;
    editingCustomer.address = address;
    editingCustomer.phone = phone;

    editingCustomer = null;
    editCustomerForm.reset();
    closeEditCustomerModal();
    showArabicToast('تم تعديل بيانات العميل بنجاح!', 'success');
    renderCustomersList();

    saveAllStatesToLocalStorage();
    addToSyncQueue(payload);
  });
}

// SUBMIT: SAVE CUSTOMER FORM (PREVENT DUPLICATION & CAPTURE GPS)
if (customerForm) {
  customerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('c-name').value.trim();
    const address = document.getElementById('c-address').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    const debt = parseFloat(document.getElementById('c-debt').value) || 0;
    const useGps = document.getElementById('c-use-gps').checked;

    if (!name || !address || !phone) {
      showArabicToast('الرجاء إدخال كافة الحقول المطلوبة', 'error');
      return;
    }

    // Get and disable the submit button immediately to prevent double submissions
    const submitBtn = document.getElementById('customer-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري الحفظ...';
    }

    // Local validation check for duplicates
    const exists = customers.some(c => c.name.trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      alert('هذا العميل مسجل بالفعل');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'حفظ العميل';
      }
      return;
    }

    // Geolocation auto-capture
    let gpsVal = '';
    try {
      gpsVal = await getCurrentLocation();
      showArabicToast('تم تحديد الموقع الجغرافي بنجاح', 'success');
    } catch (err) {
      console.warn("Auto-GPS capture failed:", err);
      if (useGps) {
        showArabicToast("فشل تحديد موقع GPS: " + err.message, "error");
      }
    }

    let latitude = 0;
    let longitude = 0;
    if (gpsVal) {
      const parts = gpsVal.split(',');
      if (parts.length === 2) {
        latitude = parseFloat(parts[0]) || 0;
        longitude = parseFloat(parts[1]) || 0;
      }
    }

    const newCustomer = {
      id: customers.length > 0 ? Math.max(...customers.map(c => c.id)) + 1 : 1,
      name,
      address,
      phone,
      debt,
      Latitude: latitude,
      Longitude: longitude
    };

    customers.push(newCustomer);

    const payload = {
      action: "addCustomer",
      shopName: name,
      address: address,
      phone: phone,
      debt: debt,
      latitude: latitude,
      longitude: longitude
    };

    saveAllStatesToLocalStorage();
    customerForm.reset();
    closeCustomerModal();
    showArabicToast('تم حفظ العميل بنجاح!', 'success');
    renderCustomersList();

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'حفظ العميل';
    }

    addToSyncQueue(payload);
  });
}

if (cartCompleteSaleBtn) {
  cartCompleteSaleBtn.addEventListener('click', () => {
    openCheckoutModal();
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLon = position.coords.longitude;
          
          let nearestCustomer = null;
          let minDistance = Infinity;
          
          customers.forEach(cust => {
            const lat = parseFloat(cust.Latitude);
            const lon = parseFloat(cust.Longitude);
            if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
              const dist = getHaversineDistanceInMeters([userLat, userLon], [lat, lon]);
              if (dist < minDistance) {
                minDistance = dist;
                nearestCustomer = cust;
              }
            }
          });
          
          // 4. MATCH FOUND: 200-meter radius
          if (nearestCustomer && minDistance <= 200) {
            if (checkoutCustomerSelect) {
              let valueToSet = nearestCustomer.id;
              // Look up matching option value (either ID or name)
              for (let i = 0; i < checkoutCustomerSelect.options.length; i++) {
                const opt = checkoutCustomerSelect.options[i];
                if (opt.value == nearestCustomer.id || opt.value === nearestCustomer.name) {
                  valueToSet = opt.value;
                  break;
                } else if (opt.textContent.includes(nearestCustomer.name)) {
                  valueToSet = opt.value;
                  break;
                }
              }
              checkoutCustomerSelect.value = valueToSet;
              checkoutCustomerSelect.dispatchEvent(new Event('change'));
              
              // Also update custom label if exists
              if (customCustomerDropdownLabel) {
                customCustomerDropdownLabel.textContent = `${nearestCustomer.name} (${nearestCustomer.address})`;
              }
            }
          }
        },
        (error) => {
          alert("تعذر تحديد الموقع، يرجى تفعيل الـ GPS");
        },
        { enableHighAccuracy: true }
      );
    } else {
      alert("مستشعر الموقع غير مدعوم في هذا المتصفح");
    }
  });
}

// CONFIRM CHECKOUT FORM
if (checkoutConfirmBtn) {
  checkoutConfirmBtn.addEventListener('click', async () => {
    checkoutConfirmBtn.disabled = true;
    const originalBtnText = checkoutConfirmBtn.textContent;
    checkoutConfirmBtn.textContent = 'جاري الحفظ...';

    // State snapshot for rollback
    const snapshot = {
      cart: JSON.parse(JSON.stringify(cart)),
      inventory: JSON.parse(JSON.stringify(inventory)),
      customers: JSON.parse(JSON.stringify(customers)),
      salesHistory: JSON.parse(JSON.stringify(salesHistory))
    };

    try {
      const discountInput = document.getElementById('checkout-discount');
      const savingsInput = document.getElementById('checkout-savings');
      const receivedInput = document.getElementById('checkout-received-input');

      const discount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
      const savings = savingsInput ? (parseFloat(savingsInput.value) || 0) : 0;
      const received = receivedInput ? (parseFloat(receivedInput.value) || 0) : 0;
      
      // Recalculate subtotal sum accurately from actual cart state
      let actualSubtotal = 0;
      cart.forEach(item => {
        const prod = inventory.find(p => p.id === item.productId);
        if (prod) actualSubtotal += prod.price * item.qty;
      });
      
      const finalVal = Math.max(0, actualSubtotal - discount);

      let customerName = 'عميل عام';
      let customer = null;

      if (isQuickCustomerActive) {
        const quickNameInput = document.getElementById('checkout-quick-customer-name');
        const theNewName = quickNameInput ? quickNameInput.value.trim() : '';
        if (!theNewName) {
          showArabicToast('الرجاء إدخال اسم المحل الجديد', 'error');
          checkoutConfirmBtn.disabled = false;
          checkoutConfirmBtn.textContent = originalBtnText;
          return;
        }

        const useGps = document.getElementById('checkout-quick-customer-gps').checked;
        let gpsVal = '';
        if (useGps) {
          showArabicToast('جاري تحديد موقع GPS للمحل...', 'info');
          try {
            gpsVal = await getCurrentLocation();
            showArabicToast('تم تحديد الموقع الجغرافي بنجاح', 'success');
          } catch (err) {
            console.error("GPS error:", err);
            showArabicToast("فشل تحديد موقع GPS: " + err.message, "error");
          }
        }

        const existing = customers.find(c => c.name.toLowerCase() === theNewName.toLowerCase());
        if (existing) {
          customer = existing;
          customerName = customer.name;
          if (received < finalVal) {
            customer.debt += (finalVal - received);
          }
        } else {
          const newCustomerId = customers.length > 0 ? Math.max(...customers.map(c => c.id)) + 1 : 1;
          let latitude = 0;
          let longitude = 0;
          if (gpsVal) {
            const parts = gpsVal.split(',');
            if (parts.length === 2) {
              latitude = parseFloat(parts[0]) || 0;
              longitude = parseFloat(parts[1]) || 0;
            }
          }
          customer = {
            id: newCustomerId,
            name: theNewName,
            address: "يكمل لاحقاً",
            phone: "-",
            debt: received < finalVal ? (finalVal - received) : 0,
            Latitude: latitude,
            Longitude: longitude
          };
          customers.push(customer);
          customerName = theNewName;

          const addCustomerPayload = {
            action: "addCustomer",
            shopName: theNewName,
            address: "يكمل لاحقاً",
            phone: "-",
            debt: 0,
            latitude: latitude,
            longitude: longitude
          };
          addToSyncQueue(addCustomerPayload);
        }
      } else {
        const customerSelect = document.getElementById('checkout-customer-select');
        const customerId = customerSelect ? customerSelect.value : '';
        customer = customers.find(c => c.id == customerId);
        customerName = customer ? customer.name : 'عميل عام';

        if (customer && received < finalVal) {
          const debtIncrease = finalVal - received;
          customer.debt += debtIncrease;
        }

        if (customer && (!customer.Latitude || !customer.Longitude)) {
          if (await showCustomConfirm("هذا المحل غير مسجل جغرافياً، هل تريد حفظ موقعك الحالي للمحل؟")) {
            showArabicToast('جاري تحديد موقع GPS للمحل...', 'info');
            try {
              const gpsVal = await getCurrentLocation();
              let latitude = 0;
              let longitude = 0;
              if (gpsVal) {
                const parts = gpsVal.split(',');
                if (parts.length === 2) {
                  latitude = parseFloat(parts[0]) || 0;
                  longitude = parseFloat(parts[1]) || 0;
                }
              }
              const updatePayload = {
                action: "updateCustomer",
                oldShopName: customer.name,
                shopName: customer.name,
                address: customer.address,
                phone: customer.phone,
                latitude: latitude,
                longitude: longitude
              };

              customer.Latitude = latitude;
              customer.Longitude = longitude;
              showArabicToast('تم تسجيل الموقع الجغرافي للمحل بنجاح!', 'success');
              addToSyncQueue(updatePayload);
            } catch (err) {
              console.error("GPS error during checkout confirmation:", err);
              showArabicToast("فشل حفظ موقع GPS للمحل: " + err.message, "error");
            }
          }
        }
      }

      let statusText = 'مدفوع';
      if (received <= 0) {
        statusText = 'آجل';
      } else if (received < finalVal) {
        statusText = 'جزئي';
      }

      const now = new Date();
      const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const invoiceId = "INV-" + Date.now();

      const cartArray = cart.map(item => {
        const prod = inventory.find(p => p.id === item.productId);
        return {
          name: prod ? prod.name : 'منتج غير معروف',
          qty: item.qty,
          price: prod ? prod.price : 0
        };
      });

      const saleObject = {
        id: salesHistory.length > 0 ? Math.max(...salesHistory.map(s => s.id)) + 1 : 1,
        invoiceId: invoiceId,
        date: dateStr,
        customerName: customerName,
        totalAmount: finalVal,
        subtotal: actualSubtotal,
        discount: discount,
        savings: savings,
        receivedAmount: received,
        status: statusText,
        items: cartArray
      };
      salesHistory.push(saleObject);

      const addSalePayload = {
        action: "addSale",
        invoiceId: invoiceId,
        customerName: customerName,
        date: dateStr,
        totalAmount: actualSubtotal,
        receivedAmount: received,
        discount: discount,
        savings: savings,
        status: statusText,
        items: cartArray,
        sellerName: activeUser ? activeUser['اسم المستخدم'] : 'بائع عام'
      };

      if (localStorage.getItem('vanModeEnabled') === 'true') {
        cartArray.forEach(item => {
          vanStock[item.name] = vanStock[item.name] || { loaded: 0, sold: 0, returned: 0, expected: 0 };
          vanStock[item.name].sold = (vanStock[item.name].sold || 0) + parseInt(item.qty);
          vanStock[item.name].expected = (vanStock[item.name].loaded || 0) - vanStock[item.name].sold + (vanStock[item.name].returned || 0);
        });
        localStorage.setItem('posVanStock', JSON.stringify(vanStock));
      }

      cart = [];
      localStorage.removeItem('posCart');
      updateCartBadge();
      renderSalesGrid();
      renderCustomersList();
      closeCheckoutModal();
      saveAllStatesToLocalStorage();
      openInvoiceOptionsModal(saleObject, customer);

      if (!navigator.onLine) {
        syncQueue.push({
          id: Date.now() + Math.random().toString(36).substr(2, 9),
          payload: addSalePayload
        });
        localStorage.setItem('posSyncQueue', JSON.stringify(syncQueue));
        showArabicToast("تم حفظ العملية محلياً (بدون إنترنت) وسيتم رفعها تلقائياً عند عودة الاتصال", "info");
      } else {
        (async () => {
          try {
            const bodyPayload = { ...addSalePayload, token: APP_SECRET_TOKEN };
            const response = await fetch(BACKEND_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'text/plain;charset=utf-8'
              },
              body: JSON.stringify(bodyPayload),
              redirect: 'follow'
            });
            const resData = await response.json();
            if (resData && resData.status === 'error') {
              throw new Error(resData.message || 'Server error');
            }
            console.log("Sale synced successfully:", invoiceId);
          } catch (err) {
            console.warn("Failed to sync sale, queuing offline:", err);
            syncQueue.push({
              id: Date.now() + Math.random().toString(36).substr(2, 9),
              payload: addSalePayload
            });
            localStorage.setItem('posSyncQueue', JSON.stringify(syncQueue));
            showArabicToast("تم حفظ العملية محلياً (بدون إنترنت) وسيتم رفعها تلقائياً عند عودة الاتصال", "info");
          }
        })();
      }

    } catch (error) {
      console.error("Critical error in checkout confirm handler:", error);
      showArabicToast("حدث خطأ غير متوقع أثناء عملية البيع", "error");
    } finally {
      checkoutConfirmBtn.disabled = false;
      checkoutConfirmBtn.textContent = originalBtnText;
    }
  });
}

if (successModalDoneBtn) {
  successModalDoneBtn.addEventListener('click', () => {
    if (successDoneModal) successDoneModal.classList.add('hidden');
    switchView('sales');
  });
}

if (invoiceOptionsModal) {
  invoiceOptionsModal.addEventListener('click', (e) => {
    if (e.target === invoiceOptionsModal) {
      closeInvoiceOptionsModal();
    }
  });
}

if (optPrintBtn) {
    optPrintBtn.addEventListener('click', () => {
        if (!lastCompletedSale) return;
        printThermalViaRawBT(lastCompletedSale, lastCompletedCustomer);
        closeInvoiceOptionsModal();
    });
}

const optPrintFallbackBtn = document.getElementById('opt-print-fallback-btn');
if (optPrintFallbackBtn) {
  optPrintFallbackBtn.addEventListener('click', () => {
    if (!lastCompletedSale) return;
    populateReceiptTemplate(lastCompletedSale);
    const receiptTemplate = document.getElementById('receiptTemplate');
    if (receiptTemplate) {
      document.body.classList.add('thermal-print-mode');
      receiptTemplate.classList.remove('d-none');
      setTimeout(() => {
        window.print();
        receiptTemplate.classList.add('d-none');
        document.body.classList.remove('thermal-print-mode');
      }, 300);
    }
    closeInvoiceOptionsModal();
  });
}

if (optWhatsappBtn) {
  optWhatsappBtn.addEventListener('click', () => {
    if (!lastCompletedSale) return;
    sendInvoiceWhatsApp(lastCompletedSale, lastCompletedCustomer);
    closeInvoiceOptionsModal();
  });
}

const btnOpenVanModal = document.getElementById('btnOpenVanModal');
const vanModal = document.getElementById('vanModal');
const vanModalClose = document.getElementById('vanModalClose');
const btnResetVanDay = document.getElementById('btnResetVanDay');

if (btnOpenVanModal && vanModal) {
  btnOpenVanModal.addEventListener('click', () => {
    vanModal.classList.remove('hidden');
    renderVanTable();
  });
}

if (vanModalClose && vanModal) {
  vanModalClose.addEventListener('click', () => {
    vanModal.classList.add('hidden');
  });
}

if (vanModal) {
  vanModal.addEventListener('click', (e) => {
    if (e.target === vanModal) {
      vanModal.classList.add('hidden');
    }
  });
}

if (btnResetVanDay) {
  btnResetVanDay.addEventListener('click', () => {
    if (confirm("هل أنت متأكد من تصفير جرد البراد وبدء يوم جديد؟")) {
      vanStock = {};
      localStorage.removeItem('posVanStock');
      renderVanTable();
    }
  });
}

// Pull-to-Refresh Gesture Handler
const mainContainer = document.querySelector('main');
let pullStartY = 0;
let pullMoveY = 0;
let isPullActive = false;
const pullThreshold = 80;

if (mainContainer && pullIndicator) {
  mainContainer.addEventListener('touchstart', (e) => {
    if (mainContainer.scrollTop === 0) {
      pullStartY = e.touches[0].pageY;
      isPullActive = true;
      pullIndicator.style.transition = 'none';
    } else {
      isPullActive = false;
    }
  }, { passive: true });

  mainContainer.addEventListener('touchmove', (e) => {
    if (!isPullActive) return;
    pullMoveY = e.touches[0].pageY;
    const diffY = pullMoveY - pullStartY;

    if (diffY > 0) {
      if (diffY > 10 && e.cancelable) {
        e.preventDefault();
      }
      const pullHeight = Math.min(diffY * 0.4, 60);
      pullIndicator.style.height = `${pullHeight}px`;
      pullIndicator.style.opacity = Math.min(diffY / 100, 1);
    }
  }, { passive: false });

  mainContainer.addEventListener('touchend', () => {
    if (!isPullActive) return;
    isPullActive = false;

    const diffY = pullMoveY - pullStartY;
    pullIndicator.style.transition = 'all 0.3s ease';

    if (diffY >= pullThreshold) {
      pullIndicator.style.height = '48px';
      pullIndicator.style.opacity = '1';

      fetchData(true).catch(() => {}).finally(() => {
        pullIndicator.style.height = '0px';
        pullIndicator.style.opacity = '0';
      });
    } else {
      pullIndicator.style.height = '0px';
      pullIndicator.style.opacity = '0';
    }

    pullStartY = 0;
    pullMoveY = 0;
  });
}

// Auto-Sync Background Task (Every 1 minute)
setInterval(() => {
  fetchData(true).catch(() => {});
}, 60000);

// --- QUICK CUSTOMER ADDITION FLOW ---
let isQuickCustomerActive = false;

const toggleQuickCustomerMode = (forceState = null) => {
  if (forceState !== null) {
    isQuickCustomerActive = forceState;
  } else {
    isQuickCustomerActive = !isQuickCustomerActive;
  }

  if (isQuickCustomerActive) {
    if (checkoutCustomerSelectWrapper) checkoutCustomerSelectWrapper.classList.add('hidden');
    if (checkoutQuickCustomerWrapper) checkoutQuickCustomerWrapper.classList.remove('hidden');
    if (checkoutQuickCustomerBtn) {
      checkoutQuickCustomerBtn.classList.add('bg-[#1e5631]', 'text-white', 'border-[#1e5631]');
      checkoutQuickCustomerBtn.classList.remove('bg-gray-100', 'text-gray-700', 'border-gray-250');
    }
  } else {
    if (checkoutCustomerSelectWrapper) checkoutCustomerSelectWrapper.classList.remove('hidden');
    if (checkoutQuickCustomerWrapper) checkoutQuickCustomerWrapper.classList.add('hidden');
    if (checkoutQuickCustomerBtn) {
      checkoutQuickCustomerBtn.classList.remove('bg-[#1e5631]', 'text-white', 'border-[#1e5631]');
      checkoutQuickCustomerBtn.classList.add('bg-gray-100', 'text-gray-700', 'border-gray-250');
    }
    if (checkoutQuickCustomerName) checkoutQuickCustomerName.value = '';
  }
};

// --- SMART AI ASSISTANT FUNCTIONS & LISTENERS ---
const openSmartAiModal = () => {
  aiTextInput.value = '';
  if (aiLoadingState) aiLoadingState.classList.add('hidden');
  if (aiExecuteBtn) aiExecuteBtn.disabled = false;
  
  if (smartAiModal) {
    smartAiModal.classList.remove('hidden');
  }
};

const closeSmartAiModal = () => {
  if (smartAiModal) {
    smartAiModal.classList.add('hidden');
  }
};

const _levenshtein = (a, b) => {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const dp = Array.from({ length: la + 1 }, (_, i) => [i]);
  for (let j = 1; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[la][lb];
};

const _levSim = (a, b) => {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - _levenshtein(a, b) / maxLen;
};

const _tokenSetSim = (a, b) => {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));
  let intersection = 0;
  tokensA.forEach(t => { if (tokensB.has(t)) intersection++; });
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const IRAQ_DIALECT_MAP = [
  [/برغر لحم|برجر لحم/g, 'برغر لحم'],
  [/برغر|برجر/g, 'برغر'],
  [/كرسبي|كريسبي/g, 'كرسبي'],
  [/كولا|كوكاكولا|كوكا/g, 'كولا'],
  [/بيبسي|بيبس/g, 'بيبسي'],
  [/سفن آب|سفن أب|٧آب/g, 'سفن اب'],
  [/شيبس|شبس|شيبز/g, 'شيبس'],
  [/ماء|ماي|ميه|مية/g, 'ماء'],
  [/عصير|عسير/g, 'عصير'],
  [/جبن|جبنة/g, 'جبن'],
  [/كيك|كعك/g, 'كيك'],
  [/بسكويت|بسكت/g, 'بسكويت'],
  [/شاي|چاي/g, 'شاي'],
  [/نسكافيه|نسكافيه|نسكافي/g, 'نسكافيه'],
  [/حليب|حلبيب|لبن/g, 'حليب'],
  [/زيت|دهن|دهون/g, 'زيت'],
  [/سكر|سكّر/g, 'سكر'],
  [/طحين|دقيق/g, 'طحين'],
  [/رز|أرز|رزة/g, 'رز'],
  [/معجون|معجنون|معجن/g, 'معجون'],
  [/صلصة|صلصه/g, 'صلصة'],
  [/مرطبات|مشروبات/g, 'مشروبات'],
  [/علبة|علبه/g, 'علبة'],
  [/كارتون|كرتون|كرتونه|كارتونه/g, 'كرتون'],
];

const _normalizeArabic = (str) => {
  if (!str) return '';
  let s = str
    .trim()
    .toLowerCase()
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[ًٌٍَُِّْ]/g, '') 
    .replace(/\s+/g, ' ');
  IRAQ_DIALECT_MAP.forEach(([pattern, replacement]) => {
    s = s.replace(pattern, replacement);
  });
  return s;
};

const FUZZY_THRESHOLD = 0.45;

const fuzzyFindProduct = (spokenName) => {
  if (!spokenName || !inventory || inventory.length === 0) return null;
  const normSpoken = _normalizeArabic(spokenName);
  let bestProduct = null;
  let bestScore = -1;

  inventory.forEach(prod => {
    const normProd = _normalizeArabic(prod.name);
    let score = 0;
    if (normProd === normSpoken) {
      score = 1.0;
    } else if (normProd.includes(normSpoken) || normSpoken.includes(normProd)) {
      const overlapLen = Math.min(normProd.length, normSpoken.length);
      score = overlapLen >= 2 ? 0.88 + (overlapLen / 100) : 0;
    } else {
      const tss = _tokenSetSim(normProd, normSpoken);
      const lev = _levSim(normProd, normSpoken);
      const prodTokens = normProd.split(' ').filter(Boolean);
      const spkTokens  = normSpoken.split(' ').filter(Boolean);
      let crossLev = 0;
      spkTokens.forEach(st => {
        prodTokens.forEach(pt => {
          const s = _levSim(st, pt);
          if (s > crossLev) crossLev = s;
        });
      });
      score = Math.max(tss * 0.45 + lev * 0.35 + crossLev * 0.2, tss, crossLev > 0.7 ? crossLev * 0.85 : 0);
    }
    if (score > bestScore) { bestScore = score; bestProduct = prod; }
  });

  return bestScore >= FUZZY_THRESHOLD ? { product: bestProduct, score: bestScore } : null;
};

const fuzzyFindCustomer = (spokenName) => {
  if (!spokenName || !customers || customers.length === 0) return null;
  const normSpoken = _normalizeArabic(spokenName);
  let bestCust = null;
  let bestScore = -1;

  customers.forEach(cust => {
    const custName = cust.shopName || cust.name || '';
    const normCust = _normalizeArabic(custName);
    let score = 0;

    if (normCust === normSpoken) {
      score = 1.0;
    } else if (normCust.includes(normSpoken) || normSpoken.includes(normCust)) {
      const overlapLen = Math.min(normCust.length, normSpoken.length);
      score = overlapLen >= 2 ? 0.9 : 0;
    } else {
      const tss = _tokenSetSim(normCust, normSpoken);
      const lev = _levSim(normCust, normSpoken);
      score = tss * 0.5 + lev * 0.5;
    }
    if (score > bestScore) { bestScore = score; bestCust = cust; }
  });

  return bestScore >= FUZZY_THRESHOLD ? bestCust : null;
};

const processAiOrder = (aiOrder) => {
  if (!aiOrder || typeof aiOrder !== 'object') {
    showArabicToast('بيانات الذكاء الاصطناعي غير صالحة', 'error');
    return;
  }

  const customerNameInput = String(aiOrder.customer || aiOrder.customerName || '').trim();

  if (customerNameInput) {
    const matchedCust = fuzzyFindCustomer(customerNameInput);
    if (matchedCust) {
      toggleQuickCustomerMode(false);
      if (checkoutCustomerSelect) checkoutCustomerSelect.value = matchedCust.id;
      if (customCustomerDropdownLabel) {
        customCustomerDropdownLabel.textContent = `${matchedCust.name || matchedCust.shopName} (${matchedCust.address || ''})`;
      }
    } else {
      toggleQuickCustomerMode(true);
      if (checkoutQuickCustomerName) checkoutQuickCustomerName.value = customerNameInput;
      showArabicToast(`عميل جديد: "${customerNameInput}" — سيُضاف تلقائياً`, 'info');
    }
  }

  cart.forEach(item => {
    const prod = inventory.find(p => p.id === item.productId);
    if (prod) { prod.qty += item.qty; prod.quantity += item.qty; }
  });
  cart = [];

  const items = Array.isArray(aiOrder.items) ? aiOrder.items : [];
  const unmatchedItems = [];
  const addedItems = [];

  items.forEach(aiItem => {
    const spokenName = String(aiItem.name || '').trim();
    if (!spokenName) return;
    const qtyWanted = Math.max(1, parseInt(aiItem.qty) || 1);
    const match = fuzzyFindProduct(spokenName);

    if (match) {
      const prod = match.product;
      const available = prod.quantity;
      const actualQty = Math.min(available, qtyWanted);

      if (actualQty > 0) {
        const existing = cart.find(c => c.productId === prod.id);
        if (existing) {
          existing.qty += actualQty;
          prod.qty -= actualQty;
          prod.quantity -= actualQty;
        } else {
          prod.qty -= actualQty;
          prod.quantity -= actualQty;
          cart.push({ productId: prod.id, qty: actualQty, price: prod.price });
        }
        addedItems.push(`${prod.name} ×${actualQty}`);
        if (actualQty < qtyWanted) {
          showArabicToast(`"${prod.name}": طلبت ${qtyWanted} والمتاح ${actualQty} فقط`, 'info');
        }
      } else {
        showArabicToast(`"${prod.name}" نفد من المخزن!`, 'error');
      }
    } else {
      unmatchedItems.push(spokenName);
    }
  });

  if (unmatchedItems.length > 0) {
    showArabicToast(`لم يُعثر على: ${unmatchedItems.join(' | ')}`, 'error');
  }

  updateCartBadge();
  renderSalesGrid();
  renderCartRows();
  saveCartState();

  setTimeout(() => {
    openCheckoutModal(true);
    if (addedItems.length > 0) {
      showArabicToast(`✅ أُضيف: ${addedItems.join('، ')}`, 'success');
    }
  }, 80);
};

const _safeParseAiJson = (raw) => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw; 

  let s = String(raw).trim();
  s = s.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/i, '').trim();
  s = s.replace(/`/g, '').trim();
  const objMatch = s.match(/\{[\s\S]*\}/);
  if (objMatch) s = objMatch[0];

  try {
    return JSON.parse(s);
  } catch {
    try {
      return JSON.parse(s.replace(/\u200f|\u200e|\u202a|\u202c/g, ''));
    } catch {
      return null;
    }
  }
};

const executeAiCommand = async () => {
  const text = aiTextInput ? aiTextInput.value.trim() : '';
  if (!text) { showArabicToast('الرجاء كتابة طلب', 'error'); return; }
  if (aiLoadingState) aiLoadingState.classList.remove('hidden');
  if (aiExecuteBtn) aiExecuteBtn.disabled = true;

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({ action: 'analyzeText', text, token: APP_SECRET_TOKEN })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();

    if (result.status === 'error') {
      showArabicToast('خطأ من السيرفر: ' + (result.message || ''), 'error');
      return;
    }

    if (result.status === 'success' && result.aiData) {
      const aiData = _safeParseAiJson(result.aiData);
      if (!aiData) { showArabicToast('فشل تحليل رد الذكاء الاصطناعي', 'error'); return; }
      closeSmartAiModal();
      processAiOrder(aiData);
    } else {
      showArabicToast('فشل تحليل النص — استجابة غير صالحة', 'error');
    }
  } catch (err) {
    console.error('executeAiCommand error:', err);
    showArabicToast('فشل الاتصال بالذكاء الاصطناعي: ' + err.message, 'error');
  } finally {
    if (aiLoadingState) aiLoadingState.classList.add('hidden');
    if (aiExecuteBtn) aiExecuteBtn.disabled = false;
  }
};

let isVoiceRecognizing = false;
const startVoiceRecognition = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showArabicToast("متصفحك لا يدعم خاصية التعرف على الصوت", "error");
    return;
  }

  if (isVoiceRecognizing) return;
  isVoiceRecognizing = true;

  const recognition = new SpeechRecognition();
  recognition.lang = 'ar-IQ';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  if (salesVoiceBtn) {
    salesVoiceBtn.classList.add('animate-pulse', 'text-red-500');
    salesVoiceBtn.classList.remove('text-gray-400');
  }

  showArabicToast("جاري الاستماع... تحدث الآن", "info");

  recognition.onstart = () => {
    console.log("Voice recognition started");
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    isVoiceRecognizing = false;
    if (salesVoiceBtn) {
      salesVoiceBtn.classList.remove('animate-pulse', 'text-red-500');
      salesVoiceBtn.classList.add('text-gray-400');
    }
    
    if (event.error === 'not-allowed') {
      showArabicToast("صلاحية الوصول إلى الميكروفون مرفوضة", "error");
    } else if (event.error === 'no-speech') {
      showArabicToast("لم يتم التقاط أي صوت، يرجى المحاولة مجدداً", "error");
    } else {
      showArabicToast("فشل التعرف على الصوت: " + event.error, "error");
    }
  };

  recognition.onend = () => {
    isVoiceRecognizing = false;
    if (salesVoiceBtn) {
      salesVoiceBtn.classList.remove('animate-pulse', 'text-red-500');
      salesVoiceBtn.classList.add('text-gray-400');
    }
  };

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    console.log("Transcript received:", transcript);
    if (!transcript.trim()) {
      showArabicToast("لم يتم التقاط أي صوت واضح", "error");
      return;
    }

    showArabicToast("جاري التحليل...", "info");

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: 'analyzeText',
          text: transcript,
          token: 'POS_AUTH_KEY_2026'
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.status === 'error') {
        showArabicToast('خطأ من السيرفر: ' + (result.message || ''), 'error');
        return;
      }

      if (result.status === 'success' && result.aiData) {
        const aiData = _safeParseAiJson(result.aiData);
        if (!aiData) {
          showArabicToast('فشل تحليل رد الذكاء الاصطناعي', 'error');
          return;
        }
        processAiOrder(aiData);
      } else {
        showArabicToast('فشل تحليل النص — استجابة غير صالحة', 'error');
      }
    } catch (err) {
      console.error('Voice Order analysis error:', err);
      showArabicToast('فشل الاتصال بالذكاء الاصطناعي: ' + err.message, 'error');
    }
  };

  recognition.start();
};

if (smartAiBtn) smartAiBtn.addEventListener('click', openSmartAiModal);
if (checkoutQuickCustomerBtn) {
  checkoutQuickCustomerBtn.addEventListener('click', () => toggleQuickCustomerMode());
}
if (smartAiClose) smartAiClose.addEventListener('click', closeSmartAiModal);
if (aiExecuteBtn) aiExecuteBtn.addEventListener('click', executeAiCommand);
if (salesVoiceBtn) salesVoiceBtn.addEventListener('click', startVoiceRecognition);

const checkoutBackBtn = document.getElementById('checkout-back-btn');
if (checkoutBackBtn) {
  checkoutBackBtn.addEventListener('click', () => {
    closeCheckoutModal();
  });
}

const pUnitInput = document.getElementById('p-unit');
const chipPacket = document.getElementById('p-unit-chip-packet');
const chipCarton = document.getElementById('p-unit-chip-carton');

if (chipPacket && chipCarton && pUnitInput) {
  const setUnit = (unit) => {
    pUnitInput.value = unit;
    if (unit === 'عبوة') {
      chipPacket.className = 'flex-1 py-3 px-4 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer shadow-sm active:scale-98 bg-[#1e5631] text-white border-[#1e5631]';
      chipCarton.className = 'flex-1 py-3 px-4 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer shadow-sm active:scale-98 bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100';
    } else {
      chipCarton.className = 'flex-1 py-3 px-4 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer shadow-sm active:scale-98 bg-[#1e5631] text-white border-[#1e5631]';
      chipPacket.className = 'flex-1 py-3 px-4 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer shadow-sm active:scale-98 bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100';
    }
  };

  chipPacket.addEventListener('click', () => setUnit('عبوة'));
  chipCarton.addEventListener('click', () => setUnit('كرتون'));
}

if (menuDarkModeBtn) {
  menuDarkModeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon();
    showArabicToast(isDark ? 'تم تفعيل الوضع الليلي' : 'تم تفعيل الوضع المضيء', 'success');
  });
}

// --- CUSTOM CUSTOMER DROPDOWN BINDINGS & SELECTORS ---
const customCustomerDropdownTrigger = document.getElementById('custom-customer-dropdown-trigger');
const customCustomerDropdownLabel = document.getElementById('custom-customer-dropdown-label');
const customCustomerDropdownMenu = document.getElementById('custom-customer-dropdown-menu');
const customCustomerDropdownSearch = document.getElementById('custom-customer-dropdown-search');
const customCustomerDropdownItems = document.getElementById('custom-customer-dropdown-items');
const customCustomerDropdownContainer = document.getElementById('custom-customer-dropdown-container');

if (customCustomerDropdownTrigger) {
  customCustomerDropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = customCustomerDropdownMenu.classList.contains('hidden');
    if (isHidden) {
      customCustomerDropdownMenu.classList.remove('hidden');
      customCustomerDropdownSearch.value = '';
      renderCustomCustomerDropdownItems();
    } else {
      customCustomerDropdownMenu.classList.add('hidden');
    }
  });
}

if (customCustomerDropdownSearch) {
  customCustomerDropdownSearch.addEventListener('input', debounce(() => {
    renderCustomCustomerDropdownItems();
  }, 300));
  customCustomerDropdownSearch.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

document.addEventListener('click', (e) => {
  if (customCustomerDropdownContainer && !customCustomerDropdownContainer.contains(e.target)) {
    if (customCustomerDropdownMenu) {
      customCustomerDropdownMenu.classList.add('hidden');
    }
  }
});

const renderCustomCustomerDropdownItems = () => {
  if (!customCustomerDropdownItems) return;
  customCustomerDropdownItems.innerHTML = '';
  const query = customCustomerDropdownSearch.value.toLowerCase().trim();
  
  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(query) || 
    c.address.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    customCustomerDropdownItems.innerHTML = `
      <div class="px-4.5 py-3 text-xs text-gray-400 text-center font-bold">لا يوجد نتائج</div>
    `;
    return;
  }

  filtered.forEach(c => {
    const div = document.createElement('div');
    div.className = `px-4.5 py-2.5 text-xs text-gray-800 font-semibold text-right hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50/50 last:border-b-0 flex justify-between items-center ${checkoutCustomerSelect.value == c.id ? 'bg-[#1e5631]/5 text-[#1e5631] font-black' : ''}`;
    div.innerHTML = `
      <span>${c.name} <span class="text-[9px] text-gray-455 font-bold mr-1">(${c.address})</span></span>
      ${checkoutCustomerSelect.value == c.id ? '<i class="fa-solid fa-circle-check text-[10px] text-[#1e5631]"></i>' : ''}
    `;
    
    div.addEventListener('click', () => {
      checkoutCustomerSelect.value = c.id;
      customCustomerDropdownLabel.textContent = `${c.name} (${c.address})`;
      customCustomerDropdownMenu.classList.add('hidden');
      checkoutCustomerSelect.dispatchEvent(new Event('change'));
    });
    
    customCustomerDropdownItems.appendChild(div);
  });
};

const selectCustomerInDropdown = (customerId) => {
  checkoutCustomerSelect.value = customerId;
  const cust = customers.find(c => c.id == customerId);
  if (cust && customCustomerDropdownLabel) {
    customCustomerDropdownLabel.textContent = `${cust.name} (${cust.address})`;
  }
};

// --- IN-FORM BARCODE SCANNER BINDINGS ---
const pBarcodeScanBtn = document.getElementById('p-barcode-scan-btn');
const editPBarcodeScanBtn = document.getElementById('edit-p-barcode-scan-btn');
let scannerTarget = 'cart';

if (pBarcodeScanBtn) {
  pBarcodeScanBtn.addEventListener('click', () => {
    scannerTarget = 'addProductBarcode';
    startCameraScanner();
  });
}

if (editPBarcodeScanBtn) {
  editPBarcodeScanBtn.addEventListener('click', () => {
    scannerTarget = 'editProductBarcode';
    startCameraScanner();
  });
}

// --- CAMERA BARCODE SCANNER FUNCTIONALITY ---
let html5Qrcode = null;

const startCameraScanner = () => {
  if (cameraScannerModal) {
    cameraScannerModal.classList.remove('hidden');
  }

  Html5Qrcode.getCameras().then(devices => {
    let cameraConfig = { facingMode: "environment" };
    
    if (devices && devices.length > 0) {
      const rearCam = devices.find(d => 
        d.label.toLowerCase().includes('back') || 
        d.label.toLowerCase().includes('rear') || 
        d.label.toLowerCase().includes('environment')
      );
      if (rearCam) {
        cameraConfig = rearCam.id;
      }
    }
    
    html5Qrcode = new Html5Qrcode("reader");
    html5Qrcode.start(
      cameraConfig,
      {
        fps: 30,
        qrbox: (width, height) => {
          const size = Math.min(width, height) * 0.7;
          return { width: size, height: size };
        },
        aspectRatio: 1.777778,
        videoConstraints: {
          facingMode: "environment",
          width: { min: 1280, ideal: 1920, max: 1920 },
          height: { min: 720, ideal: 1080, max: 1080 }
        }
      },
      onCameraScanSuccess,
      onCameraScanFailure
    ).catch(err => {
      console.error("Error starting Html5Qrcode:", err);
      html5Qrcode.start(
        { facingMode: "environment" },
        {
          fps: 30,
          qrbox: { width: 250, height: 250 },
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        onCameraScanSuccess,
        onCameraScanFailure
      ).catch(e => {
        showArabicToast("فشل فتح الكاميرا: " + e.message, "error");
      });
    });
  }).catch(err => {
    console.error("Error listing cameras:", err);
    html5Qrcode = new Html5Qrcode("reader");
    html5Qrcode.start(
      { facingMode: "environment" },
      {
        fps: 30,
        qrbox: { width: 250, height: 250 },
        videoConstraints: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      },
      onCameraScanSuccess,
      onCameraScanFailure
    ).catch(e => {
      showArabicToast("فشل فتح الكاميرا: " + e.message, "error");
    });
  });
};

const stopCameraScanner = () => {
  if (html5Qrcode) {
    html5Qrcode.stop()
      .then(() => {
        html5Qrcode = null;
        if (cameraScannerModal) cameraScannerModal.classList.add('hidden');
      })
      .catch(err => {
        console.error("Failed to stop html5Qrcode:", err);
        html5Qrcode = null;
        if (cameraScannerModal) cameraScannerModal.classList.add('hidden');
      });
  } else {
    if (cameraScannerModal) cameraScannerModal.classList.add('hidden');
  }
};

const playBeep = () => {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(100);
    } catch (e) {
      console.warn("Haptic feedback failed:", e);
    }
  }
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0.0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.15);
    }
  } catch (e) {
    console.warn("Web Audio API beep failed:", e);
  }
};

const updateThemeIcon = () => {
  if (!menuDarkModeBtn) return;
  const isDark = document.documentElement.classList.contains('dark');
  const icon = menuDarkModeBtn.querySelector('i');
  const text = document.getElementById('menu-dark-mode-text');
  if (icon) {
    if (isDark) {
      icon.className = 'fa-solid fa-sun text-gray-500 dark:text-gray-400';
      if (text) text.textContent = 'الوضع المضيء';
    } else {
      icon.className = 'fa-solid fa-moon text-gray-500 dark:text-gray-400';
      if (text) text.textContent = 'الوضع الداكن';
    }
  }
};

const onCameraScanSuccess = (decodedText, decodedResult) => {
  console.log(`Barcode scanned successfully: ${decodedText}`, decodedResult);
  playBeep();
  stopCameraScanner();

  if (scannerTarget === 'addProductBarcode') {
    const input = document.getElementById('p-barcode');
    if (input) {
      input.value = decodedText;
      showArabicToast("تم قراءة الباركود بنجاح", "success");
    }
  } else if (scannerTarget === 'editProductBarcode') {
    const input = document.getElementById('edit-p-barcode');
    if (input) {
      input.value = decodedText;
      showArabicToast("تم قراءة الباركود بنجاح", "success");
    }
  } else {
    const matchedProduct = products.find(p => String(p.barcode || '').trim() === String(decodedText || '').trim());
    if (matchedProduct) {
      if (matchedProduct.quantity > 0) {
        adjustCartItemQty(matchedProduct.id, 1);
        showArabicToast("تمت إضافة المنتج للسلة", "success");
      } else {
        showArabicToast(`عذراً، المنتج "${matchedProduct.name}" نفد من المخزن!`, "error");
      }
    } else {
      showArabicToast("المنتج غير موجود في المستودع", "error");
    }
  }
};

const onCameraScanFailure = (error) => {};

if (salesScanBtn) salesScanBtn.addEventListener('click', () => {
  scannerTarget = 'cart';
  startCameraScanner();
});
if (headerCameraBtn) headerCameraBtn.addEventListener('click', () => {
  scannerTarget = 'cart';
  startCameraScanner();
});
if (cameraScannerCloseX) cameraScannerCloseX.addEventListener('click', stopCameraScanner);
if (cameraScannerCloseBtn) cameraScannerCloseBtn.addEventListener('click', stopCameraScanner);

// --- ROLE-BASED ACCESS CONTROL (RBAC) ---
const applyRBACRules = () => {
  if (!activeUser) return;
  if (activeUser['الصلاحية'] === 'بائع') {
    const deleteButtons = document.querySelectorAll('.delete-btn, .btn-delete-product, .btn-delete-customer');
    deleteButtons.forEach(btn => {
      btn.style.setProperty('display', 'none', 'important');
    });
  }
};

// --- AUTHENTICATION & LOGIN HANDLERS ---
const handleLogin = async () => {
  try {
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (!username || !password) {
      throw new Error('الرجاء إدخال اسم المستخدم وكلمة المرور');
    }

    if (loginSubmitBtn) {
      loginSubmitBtn.disabled = true;
      loginSubmitBtn.textContent = 'جاري التحقق...';
    }

    let fetchError = null;
    try {
      await fetchData(true, username, password);
    } catch (err) {
      console.warn("Failed to fetch fresh users from backend, falling back to local cache:", err);
      fetchError = err;
    }

    const user = users.find(u => u['اسم المستخدم'] === username && String(u['كلمة المرور']) === password);
    if (user) {
      activeUser = user;
      localStorage.setItem('activeUser', JSON.stringify(user));
      document.documentElement.classList.add('user-logged-in');

      loginContainer.style.display = 'none';
      appContainer.style.display = 'flex';
      headerUserName.textContent = activeUser['اسم المستخدم'];

      loginUsernameInput.value = '';
      loginPasswordInput.value = '';

      showArabicToast(`أهلاً بك، ${activeUser['اسم المستخدم']}`, 'success');

      applyRBACRules();

      renderInventoryList();
      renderCustomersList();
      renderSalesGrid();

      fetchData(true).catch(() => {});
    } else {
      if (fetchError && users.length === 0) {
        throw new Error('تعذر الاتصال بالسيرفر للتحقق من الحساب (لا توجد بيانات محلية)!');
      } else {
        throw new Error('خطأ في اسم المستخدم أو كلمة المرور!');
      }
    }
  } catch (error) {
    console.error("Login Error:", error);
    showArabicToast(error.message, 'error');
  } finally {
    if (loginSubmitBtn) {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'دخول';
    }
  }
};

if (loginSubmitBtn) loginSubmitBtn.addEventListener('click', handleLogin);
if (loginUsernameInput) {
  loginUsernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginPasswordInput.focus();
  });
}
if (loginPasswordInput) {
  loginPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
}

const performLogout = () => {
  localStorage.removeItem('activeUser');
  document.documentElement.classList.remove('user-logged-in');
  activeUser = null;
  appContainer.style.display = 'none';
  loginContainer.style.display = 'flex';
  closeHeaderMenuDropdown();
  showArabicToast('تم تسجيل الخروج بنجاح', 'success');
};

const menuLogoutBtn = document.getElementById('menu-logout-btn');
if (menuLogoutBtn) {
  menuLogoutBtn.addEventListener('click', performLogout);
}

if (headerLogoutBtn) {
  headerLogoutBtn.addEventListener('click', performLogout);
}

// --- VISIBILITY CHANGE & GLOBAL LISTENERS ---

// --- SMART JOURNEY PLAN (DAILY ROUTE MANAGER) ---
const renderJourneyPlan = () => {
  const journeyList = document.getElementById('journey-list');
  if (!journeyList) return;
  journeyList.innerHTML = '';
  
  if (journeyPlan.length === 0) {
    journeyList.innerHTML = `<div class="text-center py-6 text-xs text-gray-400 font-bold">لا توجد زيارات مضافة للمسار اليوم.</div>`;
    return;
  }
  
  journeyPlan.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = "flex items-center justify-between bg-[#f4f6f5] hover:bg-[#e8ecea] p-3 rounded-2xl border border-gray-150 transition-colors shadow-sm gap-2";
    li.setAttribute('data-index', index);
    li.innerHTML = `
      <div class="flex items-center gap-2 flex-grow min-w-0">
        <span class="drag-handle cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 px-1 text-sm"><i class="fa-solid fa-bars"></i></span>
        <span class="w-5 h-5 rounded-full bg-[#1e5631] text-white flex items-center justify-center text-[10px] font-black shrink-0">${index + 1}</span>
        <div class="flex flex-col min-w-0 leading-tight text-right">
          <span class="text-xs font-black text-gray-900 truncate">${item.customerName}</span>
          ${item.note ? `<span class="text-[9px] text-gray-500 font-bold truncate mt-0.5"><i class="fa-solid fa-comment-dots text-gray-400 ml-1"></i>${item.note}</span>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button class="journey-details-btn px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-200 text-[10px] font-bold rounded-lg transition-colors cursor-pointer">التفاصيل</button>
        <button class="journey-remove-btn w-7 h-7 text-red-500 hover:text-red-700 flex items-center justify-center cursor-pointer transition-colors"><i class="fa-solid fa-trash-can text-xs"></i></button>
      </div>
    `;
    
    // Details action
    li.querySelector('.journey-details-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      showJourneyCustomerDetails(index);
    });
    
    // Remove action
    li.querySelector('.journey-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      journeyPlan.splice(index, 1);
      localStorage.setItem('posJourneyPlan', JSON.stringify(journeyPlan));
      renderJourneyPlan();
      showArabicToast("تمت إزالة المحل من الخطة", "info");
    });
    
    journeyList.appendChild(li);
  });
  
  initJourneySortable();
};

const initJourneySortable = () => {
  const journeyList = document.getElementById('journey-list');
  if (!journeyList || !window.Sortable) return;
  
  if (journeyList._sortable) {
    journeyList._sortable.destroy();
  }
  
  journeyList._sortable = new Sortable(journeyList, {
    handle: '.drag-handle',
    animation: 150,
    onEnd: (evt) => {
      const oldIdx = evt.oldIndex;
      const newIdx = evt.newIndex;
      if (oldIdx !== undefined && newIdx !== undefined && oldIdx !== newIdx) {
        const movedItem = journeyPlan.splice(oldIdx, 1)[0];
        journeyPlan.splice(newIdx, 0, movedItem);
        localStorage.setItem('posJourneyPlan', JSON.stringify(journeyPlan));
        renderJourneyPlan();
      }
    }
  });
};

const showJourneyCustomerDetails = (index) => {
  const item = journeyPlan[index];
  if (!item) return;
  
  const cust = customers.find(c => c.name === item.customerName);
  const debt = cust ? cust.debt : 0;
  
  const custSales = salesHistory.filter(s => s.customerName === item.customerName && s.status !== 'تسديد دفعة');
  let lastInvoiceInfo = 'لا يوجد فواتير سابقة';
  if (custSales.length > 0) {
    const lastInv = custSales[custSales.length - 1];
    lastInvoiceInfo = `${lastInv.date} - إجمالي: ${lastInv.totalAmount.toLocaleString()} د.ع (رقم: ${lastInv.invoiceId})`;
  }
  
  const hasGps = cust && cust.Latitude && cust.Longitude && cust.Latitude !== 0 && cust.Longitude !== 0;
  
  const backdrop = document.createElement('div');
  backdrop.className = 'custom-modal-backdrop';
  
  const modal = document.createElement('div');
  modal.className = 'custom-modal-window p-6 space-y-4';
  
  let gpsButtonHtml = '';
  if (hasGps) {
    gpsButtonHtml = `
      <a href="https://www.google.com/maps/dir/?api=1&destination=${cust.Latitude},${cust.Longitude}" target="_blank" class="w-full py-3.5 bg-[#1e5631] hover:bg-[#163e23] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all active:scale-98">
        <i class="fa-solid fa-map-pin"></i>
        <span>📍 فتح في خرائط جوجل (توجيهات GPS)</span>
      </a>
    `;
  } else {
    gpsButtonHtml = `
      <button class="w-full py-3.5 bg-gray-100 text-gray-400 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-gray-200" disabled>
        <i class="fa-solid fa-location-dot"></i>
        <span>الموقع الجغرافي غير متوفر</span>
      </button>
    `;
  }
  
  modal.innerHTML = `
    <div class="w-12 h-12 rounded-2xl bg-[#e8ecea] text-[#1e5631] flex items-center justify-center text-xl mx-auto shadow-sm">
      <i class="fa-solid fa-route"></i>
    </div>
    <div class="space-y-3 w-full text-right leading-relaxed select-text">
      <h3 class="font-black text-gray-900 text-sm text-center">${item.customerName}</h3>
      
      <div class="bg-gray-50 p-4.5 rounded-2xl border border-gray-150 space-y-2.5 text-xs font-semibold text-gray-700">
        <div class="flex justify-between items-center border-b border-gray-100 pb-1.5">
          <span class="text-gray-450 font-bold text-[10px] ml-2">ملاحظات المحل:</span>
          <span class="text-gray-900">${item.note || 'لا توجد ملاحظات'}</span>
        </div>
        
        <div class="flex justify-between items-center border-b border-gray-100 pb-1.5">
          <span class="text-gray-450 font-bold text-[10px] ml-2">الدين الحالي للمحل:</span>
          <span class="text-red-600 font-black">${debt.toLocaleString()} د.ع</span>
        </div>
        
        <div class="flex flex-col gap-1 text-right">
          <span class="text-gray-450 font-bold text-[10px]">آخر فاتورة:</span>
          <span class="text-gray-800 text-[11px] font-black">${lastInvoiceInfo}</span>
        </div>
      </div>
    </div>
    
    <div class="space-y-2 w-full mt-2">
      ${gpsButtonHtml}
      <button id="journey-detail-close" class="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer active:scale-98 transition-all">
        إغلاق
      </button>
    </div>
  `;
  
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  
  requestAnimationFrame(() => {
    backdrop.classList.add('active');
  });
  
  const close = () => {
    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.remove();
    }, 250);
  };
  
  modal.querySelector('#journey-detail-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
};

// Wire modal event listeners
const headerJourneyBtn = document.getElementById('header-journey-btn');
const journeyModal = document.getElementById('journey-modal');
const journeyClose = document.getElementById('journey-close');
const journeyCustomerSelect = document.getElementById('journey-customer-select');
const journeyNoteInput = document.getElementById('journey-note-input');
const journeyAddBtn = document.getElementById('journey-add-btn');
const journeyClearBtn = document.getElementById('journey-clear-btn');

if (headerJourneyBtn && journeyModal) {
  headerJourneyBtn.addEventListener('click', () => {
    journeyModal.classList.remove('hidden');
    if (journeyCustomerSelect) {
      journeyCustomerSelect.innerHTML = customers.map(c => `<option value="${c.name}">${c.name} (${c.address})</option>`).join('');
    }
    renderJourneyPlan();
  });
}
if (journeyClose && journeyModal) {
  journeyClose.addEventListener('click', () => {
    journeyModal.classList.add('hidden');
  });
}
if (journeyModal) {
  journeyModal.addEventListener('click', (e) => {
    if (e.target === journeyModal) {
      journeyModal.classList.add('hidden');
    }
  });
}
if (journeyAddBtn) {
  journeyAddBtn.addEventListener('click', () => {
    const custName = journeyCustomerSelect ? journeyCustomerSelect.value : '';
    const note = journeyNoteInput ? journeyNoteInput.value.trim() : '';
    if (!custName) {
      showArabicToast('الرجاء اختيار عميل أولاً', 'error');
      return;
    }
    journeyPlan.push({ customerName: custName, note: note });
    localStorage.setItem('posJourneyPlan', JSON.stringify(journeyPlan));
    if (journeyNoteInput) journeyNoteInput.value = '';
    renderJourneyPlan();
    showArabicToast('تمت إضافة المحل إلى المسار اليومي', 'success');
  });
}
if (journeyClearBtn) {
  journeyClearBtn.addEventListener('click', async () => {
    if (journeyPlan.length === 0) return;
    if (await showCustomConfirm('هل أنت متأكد من مسح جميع الزيارات من المسار اليومي؟')) {
      journeyPlan = [];
      localStorage.removeItem('posJourneyPlan');
      renderJourneyPlan();
      showArabicToast('تم مسح مسار الزيارات بالكامل', 'info');
    }
  });
}

// --- INITIALIZER STARTUP ---
const initApp = () => {
  const storedUser = localStorage.getItem('activeUser');
  if (storedUser) {
    try {
      activeUser = JSON.parse(storedUser);
      document.documentElement.classList.add('user-logged-in');
      if (loginContainer) loginContainer.style.display = 'none';
      if (appContainer) appContainer.style.display = 'flex';
      if (headerUserName) headerUserName.textContent = activeUser['اسم المستخدم'];
    } catch (e) {
      console.error("Failed to parse stored session user:", e);
      localStorage.removeItem('activeUser');
      document.documentElement.classList.remove('user-logged-in');
      if (loginContainer) loginContainer.style.display = 'flex';
      if (appContainer) appContainer.style.display = 'none';
    }
  } else {
    if (loginContainer) loginContainer.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
  }
  updateThemeIcon();

  loadStatesFromLocalStorage();
  
  const savedThreshold = parseInt(localStorage.getItem('lowStockThreshold')) || 5;
  if (document.getElementById('lowStockThresholdInput')) {
    document.getElementById('lowStockThresholdInput').value = savedThreshold;
  }
  document.getElementById('lowStockThresholdInput')?.addEventListener('input', (e) => {
    localStorage.setItem('lowStockThreshold', e.target.value);
    renderProductsList();
  });

  const vanModeToggle = document.getElementById('vanModeToggle');
  const btnOpenVanModal = document.getElementById('btnOpenVanModal');
  const isVanModeEnabled = localStorage.getItem('vanModeEnabled') === 'true';

  if (vanModeToggle) {
    vanModeToggle.checked = isVanModeEnabled;
    vanModeToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('vanModeEnabled', enabled);
      if (btnOpenVanModal) {
        if (enabled) {
          btnOpenVanModal.classList.remove('d-none');
        } else {
          btnOpenVanModal.classList.add('d-none');
        }
      }
    });
  }

  if (btnOpenVanModal) {
    if (isVanModeEnabled) {
      btnOpenVanModal.classList.remove('d-none');
    } else {
      btnOpenVanModal.classList.add('d-none');
    }
  }
  
  renderInventoryList();
  renderCustomersList();
  renderSalesGrid();

  switchView('sales');
  updateCartBadge();
  if (cart.length > 0) {
    renderCartRows();
  }

  if (activeUser) {
    applyRBACRules();
  }

  fetchData(true).catch(() => {});
  processSyncQueue();
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
