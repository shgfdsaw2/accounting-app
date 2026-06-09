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
let cart = [];
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
let users = [];
let activeUser = null;
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxwkA3AUQ2uRiVNKfsrmtidH5GDKm3DoHb50qewPqfhKLILl-Q8UqB6QzvKlV_JVSRyGg/exec";

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
};

const loadStatesFromLocalStorage = () => {
  inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
  products = inventory;
  customers = JSON.parse(localStorage.getItem('customers') || '[]');
  salesHistory = JSON.parse(localStorage.getItem('salesHistory') || '[]');
  purchases = JSON.parse(localStorage.getItem('purchases') || '[]');
  suppliers = JSON.parse(localStorage.getItem('suppliers') || '[]');
  users = JSON.parse(localStorage.getItem('users') || '[]');
};

// --- OPTIMISTIC UI BACKGROUND SYNC QUEUE ---
let syncQueue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
const saveQueue = () => localStorage.setItem('syncQueue', JSON.stringify(syncQueue));

const addToSyncQueue = (payload) => {
  syncQueue.push({
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    payload: payload
  });
  saveQueue();
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
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(item.payload),
        redirect: 'follow'
      });
      
      const resData = await response.json();
      if (resData && resData.status === 'error') {
        console.error("Server returned sync error:", resData.message);
        syncQueue.shift();
        saveQueue();
      } else {
        syncQueue.shift();
        saveQueue();
        console.log("Sync item processed successfully:", item.payload.action);
      }
    } catch (err) {
      console.error("Failed to sync queue item:", err);
      break;
    }
  }

  isProcessingQueue = false;
};

window.addEventListener('online', processSyncQueue);


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
const headerSmartAiBtn = document.getElementById('header-smart-ai-btn');
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
const headerDarkModeBtn = document.getElementById('header-dark-mode-btn');

// --- VIEW NAVIGATION ROUTING ---
const views = {
  sales: { el: viewSales, tab: navSales },
  customers: { el: viewCustomers, tab: navCustomers },
  inventory: { el: viewInventory, tab: navInventory }
};

const switchView = (targetViewKey) => {
  closeQuickMenu();
  
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
    info: 'bg-gray-50 text-gray-800 border-gray-100'
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
const loadInitialData = (isSilent = false, username = '', password = '') => {
  const hasCachedData = inventory.length > 0 || customers.length > 0;
  const runSilently = isSilent || hasCachedData;

  if (!runSilently) {
    isLoading = true;
    hasError = false;
    renderSalesGrid();
    renderCustomersList();
    renderInventoryList();
  }

  let fetchUrl = BACKEND_URL;
  if (username && password) {
    fetchUrl += "?username=" + encodeURIComponent(username) + "&password=" + encodeURIComponent(password);
  }

  return fetch(fetchUrl)
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
          price: parseFloat(item.price) !== undefined && !isNaN(parseFloat(item.price)) ? parseFloat(item.price) : (parseFloat(item['سعر البيع']) || 0),
          wholesalePrice: parseFloat(item.wholesalePrice) !== undefined && !isNaN(parseFloat(item.wholesalePrice)) ? parseFloat(item.wholesalePrice) : (parseFloat(item['سعر الجملة']) || 0),
          category: item.category || item['الصنف'] || 'الغذائيات',
          unit: item.category || item['الصنف'] || 'عبوة',
          barcode: String(item.barcode !== undefined ? item.barcode : (item['الباركود'] || '')),
          // Backwards compatibility keys
          qty: parseInt(item.quantity) !== undefined && !isNaN(parseInt(item.quantity)) ? parseInt(item.quantity) : (parseInt(item['الكميه']) || parseInt(item['الكمية']) || 0),
          sellPrice: parseFloat(item.price) !== undefined && !isNaN(parseFloat(item.price)) ? parseFloat(item.price) : (parseFloat(item['سعر البيع']) || 0),
          costPrice: parseFloat(item.wholesalePrice) !== undefined && !isNaN(parseFloat(item.wholesalePrice)) ? parseFloat(item.wholesalePrice) : (parseFloat(item['سعر الشراء']) || 0)
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
          gps: item['الموقع'] || item['موقع'] || item['gps'] || ''
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
    })
    .catch(err => {
      console.warn("Background fetch sync failed:", err);
      isLoading = false;
      
      // Genuinely silent background sync failures: only set hasError and show toast if not silent
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
  if (isLoading && inventory.length === 0) {
    salesProductsGrid.innerHTML = `
      <div class="col-span-2 text-center py-12">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-[#1e5631] mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">جاري تحميل المنتجات...</span>
      </div>
    `;
    salesProductsCount.textContent = '...';
    return;
  }
  if (hasError && inventory.length === 0) {
    salesProductsGrid.innerHTML = `
      <div class="col-span-2 text-center py-12">
        <i class="fa-solid fa-circle-exclamation text-2xl text-red-500 mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">فشل في تحميل المنتجات</span>
      </div>
    `;
    salesProductsCount.textContent = '...';
    return;
  }

  const query = salesSearchBar ? salesSearchBar.value.toLowerCase().trim() : '';
  salesProductsGrid.innerHTML = '';
  
  const filtered = inventory.filter(p => 
    p.name.toLowerCase().includes(query) || 
    (p.barcode && p.barcode.toLowerCase().includes(query))
  );
  salesProductsCount.textContent = `${filtered.length} منتج`;

  if (filtered.length === 0) {
    salesProductsGrid.innerHTML = `
      <div class="col-span-2 bg-white rounded-2xl border border-gray-100 p-8 text-center clean-shadow">
        <i class="fa-solid fa-box-open text-2xl text-gray-300 mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">المخزن لا يحتوي على منتجات مطابقة</span>
      </div>
    `;
    return;
  }

  // Alphabetical sorting of filtered items
  filtered.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  filtered.forEach(prod => {
    const card = document.createElement('div');
    card.className = 'bg-white p-4.5 rounded-2xl border border-gray-100 clean-shadow flex flex-col justify-between space-y-3 select-none';
    
    // Find quantity in cart
    const cartItem = cart.find(c => c.productId === prod.id);
    const cartQty = cartItem ? cartItem.qty : 0;

    // Low stock warning class
    let qtyClass = 'text-gray-500';
    if (prod.quantity === 0) qtyClass = 'text-red-500 font-extrabold';
    else if (prod.quantity < 5) qtyClass = 'text-amber-500 font-extrabold';

    const { cartonPrice, unitPrice } = getProductPrices(prod);
    card.innerHTML = `
      <div>
        <h4 class="text-xs font-extrabold text-gray-900 line-clamp-2 min-h-[32px]">${prod.name}</h4>
        <div class="mt-2 space-y-1">
          <div class="flex justify-between text-[10px]">
            <span class="text-gray-400">سعر الكارتون:</span>
            <span class="font-extrabold text-[#1e5631]">${cartonPrice.toLocaleString()} د.ع</span>
          </div>
          <div class="flex justify-between text-[10px]">
            <span class="text-gray-400">سعر المفرد:</span>
            <span class="font-extrabold text-[#1e5631]">${unitPrice.toLocaleString()} د.ع</span>
          </div>
          <div class="flex justify-between text-[10px] ${qtyClass}">
            <span>العدد:</span>
            <span>${prod.quantity} ${prod.unit}</span>
          </div>
        </div>
      </div>
      
      <!-- Inline Cart Controls -->
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

    // Event listeners
    const btnDec = card.querySelector('.btn-dec');
    const btnInc = card.querySelector('.btn-inc');

    btnDec.addEventListener('click', (e) => {
      e.stopPropagation();
      if (cartQty > 0) {
        adjustCartItemQty(prod.id, -1);
      }
    });

    btnInc.addEventListener('click', (e) => {
      e.stopPropagation();
      if (prod.quantity > 0) {
        adjustCartItemQty(prod.id, 1);
      } else {
        showArabicToast(`عذراً، منتج "${prod.name}" نفد من المخزن!`, 'error');
      }
    });

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

  // Sort chronologically descending (newest first)
  const sorted = [...salesHistory].sort((a, b) => new Date(b.date) - new Date(a.date));

  let lastDateLabel = '';

  sorted.forEach(sale => {
    const dateLabel = getDateLabel(sale.date);
    if (dateLabel !== lastDateLabel) {
      lastDateLabel = dateLabel;
      
      const headerDiv = document.createElement('div');
      headerDiv.className = 'sticky top-0 z-20 bg-gray-50 dark:bg-[#222222] py-2 px-3.5 text-[10px] font-black text-gray-500 dark:text-gray-400 border-b border-gray-250 dark:border-gray-150 select-none shadow-sm rounded-xl mt-4';
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
        <!-- Print Action -->
        <button class="btn-print-invoice-action w-7 h-7 rounded-lg bg-white text-gray-500 hover:text-gray-800 flex items-center justify-center border border-gray-200 cursor-pointer transition-colors" title="🖨️ طباعة">
          <i class="fa-solid fa-print text-[10px]"></i>
        </button>
        <!-- WhatsApp Action -->
        <button class="btn-whatsapp-invoice-action w-7 h-7 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 flex items-center justify-center cursor-pointer transition-colors" title="💬 واتساب">
          <i class="fa-brands fa-whatsapp text-sm"></i>
        </button>
      </div>
    `;

    // Click to view invoice details
    row.addEventListener('click', () => {
      openInvoiceDetailsModal(sale);
    });

    // Print Button click
    row.querySelector('.btn-print-invoice-action').addEventListener('click', (e) => {
      e.stopPropagation();
      const cust = customers.find(c => c.name === sale.customerName);
      if (printSection) {
        printSection.innerHTML = generatePrintReceipt(sale, cust);
      }
      window.print();
    });

    // WhatsApp Button click
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
  detailInvoiceId.textContent = invoice.invoiceId;
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

  // Status Badge Class mapping
  detailInvoiceStatus.textContent = status;
  let badgeClass = '';
  if (status === 'مدفوع') badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
  else if (status === 'جزئي') badgeClass = 'bg-amber-50 text-amber-700 border-amber-100';
  else badgeClass = 'bg-red-50 text-red-700 border-red-100';
  detailInvoiceStatus.className = `px-2.5 py-0.5 rounded-full border text-[9px] font-black ${badgeClass}`;

  // Populate items
  detailInvoiceItems.innerHTML = '';
  if (!invoice.items || invoice.items.length === 0) {
    detailInvoiceItems.innerHTML = '<div class="text-center py-4 text-xs text-gray-400">لا توجد تفاصيل للمواد في هذه الفاتورة.</div>';
  } else {
    // Header for items grid
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
      const cust = customers.find(c => c.name === invoice.customerName);
      if (printSection) {
        printSection.innerHTML = generatePrintReceipt(invoice, cust);
      }
      window.print();
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
const getCustomerLedger = (customer) => {
  return salesHistory.filter(sale => sale.customerName === customer.name);
};

const renderCustomerLedgerView = (customer) => {
  profileLedgerList.innerHTML = '';
  const customerSales = getCustomerLedger(customer);

  if (customerSales.length === 0) {
    profileLedgerList.innerHTML = '<div class="text-center py-6 text-xs text-gray-400">لا توجد فواتير مسجلة لهذا العميل.</div>';
  } else {
    // Sort newest first
    customerSales.sort((a, b) => new Date(b.date) - new Date(a.date));

    customerSales.forEach(sale => {
      const row = document.createElement('div');
      
      let badgeClass = '';
      let titleText = `فاتورة #${sale.invoiceId}`;
      let amountClass = 'text-[#1e5631] bg-[#e8ecea]';
      let changePrefix = '+ ';

      if (sale.status === 'تسديد دفعة' || sale.invoiceId.startsWith('PAY-')) {
        badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
        titleText = 'تسديد دفعة';
        amountClass = 'text-emerald-700 bg-emerald-50 border border-emerald-100';
        changePrefix = '- ';
        
        row.innerHTML = `
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-extrabold text-gray-800">${titleText}</span>
              <span class="text-[9px] px-2 py-0.5 rounded-full border ${badgeClass} font-black">مدفوع</span>
            </div>
            <span class="text-[9px] text-gray-400 font-bold block">${sale.date}</span>
          </div>
          <span class="text-[10px] font-black ${amountClass} px-3 py-1 rounded-lg">
            ${changePrefix}${sale.totalAmount.toLocaleString()} د.ع
          </span>
        `;
      } else {
        if (sale.status === 'مدفوع') badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
        else if (sale.status === 'جزئي') badgeClass = 'bg-amber-50 text-amber-700 border-amber-100';
        else badgeClass = 'bg-red-50 text-red-700 border-red-100';
        
        row.innerHTML = `
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-extrabold text-gray-800">${titleText}</span>
              <span class="text-[9px] px-2 py-0.5 rounded-full border ${badgeClass} font-black">${sale.status}</span>
            </div>
            <span class="text-[9px] text-gray-400 font-bold block">${sale.date}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-black ${amountClass} px-3 py-1 rounded-lg">
              ${changePrefix}${sale.totalAmount.toLocaleString()} د.ع
            </span>
            <!-- Print Action -->
            <button class="btn-print-invoice-action w-7 h-7 rounded-lg bg-white text-gray-500 hover:text-gray-800 flex items-center justify-center border border-gray-200 cursor-pointer transition-colors" title="🖨️ طباعة">
              <i class="fa-solid fa-print text-[10px]"></i>
            </button>
            <!-- WhatsApp Action -->
            <button class="btn-whatsapp-invoice-action w-7 h-7 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 flex items-center justify-center cursor-pointer transition-colors" title="💬 واتساب">
              <i class="fa-brands fa-whatsapp text-sm"></i>
            </button>
          </div>
        `;
      }

      // Interactivity: clicking opening the Invoice Details modal!
      if (sale.status !== 'تسديد دفعة' && !sale.invoiceId.startsWith('PAY-')) {
        row.className = 'bg-[#f4f6f5] p-3.5 rounded-xl border border-gray-100 flex justify-between items-center cursor-pointer hover:border-gray-200 transition-all active:scale-[0.98]';
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
      } else {
        row.className = 'bg-[#f4f6f5] p-3.5 rounded-xl border border-gray-100 flex justify-between items-center select-none';
      }

      profileLedgerList.appendChild(row);
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

// --- RENDER COMPONENT: CUSTOMER DIRECTORY ---
const renderCustomersList = () => {
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
        <i class="fa-solid fa-circle-exclamation text-2xl text-red-500 mb-2 block"></i>
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

  // Sort alphabetically
  filtered.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl border border-gray-100 clean-shadow flex flex-col transition-all overflow-hidden select-none';
    
    // Status text color for debt
    const debtClass = c.debt > 0 ? 'text-red-500 font-extrabold' : 'text-emerald-500 font-bold';

    // GPS styling classes
    const gpsBtnClass = c.gps 
      ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200' 
      : 'bg-gray-50 text-gray-400 hover:bg-gray-100 border border-gray-200';
    const gpsBtnTitle = c.gps 
      ? 'تحديث موقع المحل الجغرافي (مسجل حالياً)' 
      : 'تسجيل موقع المحل الجغرافي (غير مسجل)';

    card.innerHTML = `
      <!-- Collapsed Main Row -->
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

      <!-- Expandable Accordion Content Area -->
      <div class="accordion-content hidden border-t border-gray-50 bg-[#f8f9fa] dark:bg-[#1a1a1a] p-4.5 space-y-3">
        <!-- Details with subtle location pin -->
        <div class="grid grid-cols-2 gap-2 text-[10px] text-gray-600 dark:text-gray-400 font-bold">
          <div class="flex items-center gap-1.5 truncate text-right">
            <i class="fa-solid fa-map-location-dot text-gray-450 text-xs"></i>
            <span class="truncate">${c.address || 'لا يوجد عنوان'}</span>
          </div>
          <div class="flex items-center gap-1.5 text-right">
            <i class="fa-solid fa-phone text-gray-450 text-xs"></i>
            <span>${c.phone || 'لا يوجد هاتف'}</span>
          </div>
        </div>
        <!-- Actions row -->
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

    const cardHeader = card.querySelector('.card-header');
    const accordionContent = card.querySelector('.accordion-content');
    const arrow = card.querySelector('.accordion-arrow');

    cardHeader.addEventListener('click', () => {
      const isHidden = accordionContent.classList.toggle('hidden');
      if (arrow) {
        arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    });

    // Make Payment directly
    card.querySelector('.btn-make-payment').addEventListener('click', (e) => {
      e.stopPropagation();
      openCustomerProfileModal(c.id);
      // Auto-open pay debt form container
      if (payDebtFormContainer) {
        payDebtFormContainer.classList.remove('hidden');
        payDebtAmount.value = '';
      }
    });

    // Ledger (Account Statement) click handler
    card.querySelector('.btn-ledger').addEventListener('click', (e) => {
      e.stopPropagation();
      openCustomerProfileModal(c.id);
    });

    // GPS Relocate click handler
    card.querySelector('.btn-gps-relocate').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await showCustomConfirm("تحديث موقع المحل إلى مكانك الحالي؟")) {
        showArabicToast('جاري تحديد موقع GPS للمحل...', 'info');
        try {
          const gpsVal = await getCurrentLocation();
          
          const updatePayload = {
            action: "updateCustomer",
            oldShopName: c.name,
            shopName: c.name,
            address: c.address,
            phone: c.phone,
            gps: gpsVal
          };

          c.gps = gpsVal;
          saveAllStatesToLocalStorage();
          renderCustomersList();
          showArabicToast('تم تحديث الموقع الجغرافي للمحل بنجاح!', 'success');
          addToSyncQueue(updatePayload);
        } catch (err) {
          console.error("GPS relocate error:", err);
          showArabicToast("فشل تحديد موقع GPS: " + err.message, "error");
        }
      }
    });

    // Edit Customer click handler
    card.querySelector('.btn-edit-customer').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditCustomerModal(c);
    });

    // Record Return click handler
    card.querySelector('.btn-return-customer').addEventListener('click', (e) => {
      e.stopPropagation();
      openAddReturnModal(c);
    });

    // WhatsApp click handler
    card.querySelector('.btn-whatsapp').addEventListener('click', (e) => {
      e.stopPropagation();
      triggerWhatsAppRedirect(c.phone);
    });

    customersList.appendChild(card);
  });
};

// --- RENDER COMPONENT: INVENTORY STOCKS ---
const renderInventoryList = () => {
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
    return;
  }
  if (hasError && products.length === 0) {
    inventoryList.innerHTML = `
      <div class="text-center py-12">
        <i class="fa-solid fa-circle-exclamation text-2xl text-red-500 mb-2 block"></i>
        <span class="text-xs font-bold text-gray-500">فشل في تحميل المخزون</span>
      </div>
    `;
    return;
  }

  const inventorySearchBar = document.getElementById('inventory-search-bar');
  const query = inventorySearchBar ? inventorySearchBar.value.toLowerCase().trim() : '';
  inventoryList.innerHTML = '';
  
  const filtered = inventory.filter(p => p.name.toLowerCase().includes(query) || (p.barcode && p.barcode.includes(query)));

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
    const card = document.createElement('div');
    card.className = 'bg-white p-4.5 rounded-2xl border border-gray-100 clean-shadow flex justify-between items-center gap-3 select-none';
    
    const { cartonPrice, unitPrice } = getProductPrices(p);
    card.innerHTML = `
      <div class="space-y-1 flex-1 min-w-0">
        <h4 class="text-xs font-extrabold text-gray-900 truncate">${p.name}</h4>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-gray-400 font-bold">
          <span>شراء: <strong class="text-gray-700">${p.wholesalePrice.toLocaleString()} د.ع</strong></span>
          <span>كارتون: <strong class="text-gray-700">${cartonPrice.toLocaleString()} د.ع</strong></span>
          <span>مفرد: <strong class="text-gray-700">${unitPrice.toLocaleString()} د.ع</strong></span>
        </div>
      </div>
      <div class="flex items-center gap-3.5">
        <div class="text-left">
          <span class="text-[9px] text-gray-450 block font-bold">العدد</span>
          <span class="text-xs font-black text-[#1e5631] block">${p.quantity} ${p.unit}</span>
        </div>
        <!-- Actions: Edit & Delete -->
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

    card.querySelector('.btn-edit-product').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditProductModal(p);
    });

    card.querySelector('.btn-delete-product').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteProduct(p);
    });

    inventoryList.appendChild(card);
  });

  applyRBACRules();
};

// Alias / Wrapper for backwards compatibility or external calls
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
  const cleanNum = phone.replace(/\D/g, ''); // strip out any spaces, non-digits
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
    
    row.innerHTML = `
      <div class="space-y-1 flex-1 pr-1">
        <h4 class="text-xs font-extrabold text-gray-800">${prod.name}</h4>
        <span class="text-[10px] text-gray-500 font-bold block">${prod.price.toLocaleString()} د.ع / ${prod.unit}</span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Decrement -->
        <button onclick="adjustCartItemQty(${item.productId}, -1)" class="w-8 h-8 rounded-lg bg-white text-gray-700 font-black flex items-center justify-center border border-gray-200 cursor-pointer active:scale-90 select-none">
          <i class="fa-solid fa-minus text-[10px]"></i>
        </button>
        <!-- Val -->
        <span class="text-xs font-black text-gray-900 w-6 text-center select-none">${item.qty}</span>
        <!-- Increment -->
        <button onclick="adjustCartItemQty(${item.productId}, 1)" class="w-8 h-8 rounded-lg bg-white text-gray-700 font-black flex items-center justify-center border border-gray-200 cursor-pointer active:scale-90 select-none">
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

const adjustCartItemQty = (productId, change) => {
  let cartItem = cart.find(c => c.productId === productId);
  const prod = inventory.find(p => p.id === productId);
  if (!prod) return;

  if (change > 0) {
    // Check stock limit
    if (prod.quantity <= 0) {
      showArabicToast('لا يتوفر مخزون إضافي للمنتج!', 'error');
      return;
    }
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
      // Return stock to inventory
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

  // Reset chips selector UI to default 'عبوة'
  const pUnitInput = document.getElementById('p-unit');
  const chipPacket = document.getElementById('p-unit-chip-packet');
  const chipCarton = document.getElementById('p-unit-chip-carton');
  if (pUnitInput && chipPacket && chipCarton) {
    pUnitInput.value = 'عبوة';
    chipPacket.className = 'flex-1 py-3 px-4 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer shadow-sm active:scale-98 bg-[#1e5631] text-white border-[#1e5631]';
    chipCarton.className = 'flex-1 py-3 px-4 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer shadow-sm active:scale-98 bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100';
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
  
  // Populate products
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
        <button class="text-red-400 hover:text-red-650 cursor-pointer" onclick="deleteFromPurchaseCart(${idx})">
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
    row.className = 'bg-[#f4f6f5] p-3.5 rounded-xl border border-gray-100 flex justify-between items-center select-none cursor-pointer hover:border-gray-200 transition-all active:scale-[0.98]';
    
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
  
  // Populate supplier select dropdown
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
  
  // Sort alphabetically
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
  if (editPSell) editPSell.value = product.price;
  if (editPBuy) editPBuy.value = product.wholesalePrice;
  if (editPCategory) editPCategory.value = product.category || 'الغذائيات';
  if (editPQty) editPQty.value = product.quantity;
  
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

  const payload = {
    action: "deleteProduct",
    name: product.name
  };

  // Optimistic UI updates
  inventory = inventory.filter(item => item.id !== product.id);
  products = inventory;
  saveAllStatesToLocalStorage();
  
  renderInventoryList();
  renderSalesGrid();
  
  showArabicToast('تم حذف المنتج بنجاح!', 'success');
  addToSyncQueue(payload);
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
const openCheckoutModal = (keepQuickAddCustomerState = false) => {
  closeCartDrawer();
  if (keepQuickAddCustomerState !== true) {
    toggleQuickCustomerMode(false);
  }
  
  // Calculate cart subtotal sum
  let sum = 0;
  cart.forEach(item => {
    const prod = inventory.find(p => p.id === item.productId);
    if (prod) sum += prod.price * item.qty;
  });

  checkoutSubtotalVal.textContent = `${sum.toLocaleString()} د.ع`;
  checkoutFinalVal.textContent = `${sum.toLocaleString()} د.ع`;
  
  // Clear inputs
  checkoutDiscount.value = '';
  if (checkoutSavings) checkoutSavings.value = '';
  checkoutReceivedInput.value = '';
  
  // Dynamic debt badge init to Deferred (آجل)
  updateCheckoutDebtBadge(sum, 0);

  // Auto fill date
  const now = new Date();
  checkoutDateInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  // Populate customers select dropdown
  checkoutCustomerSelect.innerHTML = '';
  customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.address})`;
    checkoutCustomerSelect.appendChild(opt);
  });

  // Set default custom dropdown label
  if (customers.length > 0) {
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

  if (customCustomerDropdownMenu) {
    customCustomerDropdownMenu.classList.add('hidden');
  }

  checkoutModal.classList.remove('hidden');
  setTimeout(() => {
    checkoutModal.classList.remove('modal-hidden');
    checkoutModal.classList.add('modal-visible');
  }, 20);
};

const closeCheckoutModal = () => {
  checkoutModal.classList.remove('modal-visible');
  checkoutModal.classList.add('modal-hidden');
  setTimeout(() => {
    checkoutModal.classList.add('hidden');
  }, 220);

  // Reset scroll position to fix mobile keyboard viewport shift
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  if (document.documentElement) {
    document.documentElement.scrollTop = 0;
  }
};

// --- DYNAMIC CHECKOUT DEBT BADGE CALCULATOR ---
const updateCheckoutDebtBadge = (finalVal, receivedVal) => {
  if (isNaN(receivedVal) || receivedVal <= 0) {
    // 100% Debt / Deferred
    checkoutDebtBadge.textContent = 'آجل';
    checkoutDebtBadge.className = 'px-3.5 py-2.5 rounded-xl text-xs font-black text-center min-w-[70px] bg-red-50 text-red-700 border border-red-200 select-none';
  } else if (receivedVal < finalVal) {
    // Partial payment
    checkoutDebtBadge.textContent = 'جزئي';
    checkoutDebtBadge.className = 'px-3.5 py-2.5 rounded-xl text-xs font-black text-center min-w-[70px] bg-amber-50 text-amber-700 border border-amber-200 select-none';
  } else {
    // Fully Paid
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

// Header Kebab Menu Dropdown
headerMenuBtn.addEventListener('click', toggleHeaderMenuDropdown);
if (menuSalesHistoryBtn) {
  menuSalesHistoryBtn.addEventListener('click', openSalesHistoryModal);
}
if (headerSalesHistoryBtn) {
  headerSalesHistoryBtn.addEventListener('click', openSalesHistoryModal);
}

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  if (headerMenuDropdown && !headerMenuDropdown.classList.contains('hidden')) {
    closeHeaderMenuDropdown();
  }
});

// SPA Tab switching
navSales.addEventListener('click', () => switchView('sales'));
navCustomers.addEventListener('click', () => switchView('customers'));
navInventory.addEventListener('click', () => switchView('inventory'));

// Shortcut buttons
customersAddBtnShortcut.addEventListener('click', openCustomerModal);
inventoryAddBtnShortcut.addEventListener('click', openProductModal);

if (salesSearchBar) {
  salesSearchBar.addEventListener('input', () => {
    renderSalesGrid();
  });
}

const customersSearchBar = document.getElementById('customers-search-bar');
if (customersSearchBar) {
  customersSearchBar.addEventListener('input', () => {
    renderCustomersList();
  });
}

const inventorySearchBar = document.getElementById('inventory-search-bar');
if (inventorySearchBar) {
  inventorySearchBar.addEventListener('input', () => {
    renderInventoryList();
  });
}

// Giant Hero FAB
headerAddBtn.addEventListener('click', openQuickMenu);
quickMenuDismiss.addEventListener('click', closeQuickMenu);
quickMenuClose.addEventListener('click', closeQuickMenu);

quickAddProduct.addEventListener('click', openProductModal);
quickAddCustomer.addEventListener('click', openCustomerModal);

// Modal dismiss handles
addProductDismiss.addEventListener('click', closeProductModal);
addProductClose.addEventListener('click', closeProductModal);

addCustomerDismiss.addEventListener('click', closeCustomerModal);
addCustomerClose.addEventListener('click', closeCustomerModal);

headerCartBtn.addEventListener('click', openCartDrawer);
cartDrawerDismiss.addEventListener('click', closeCartDrawer);
cartDrawerClose.addEventListener('click', closeCartDrawer);

checkoutDismiss.addEventListener('click', closeCheckoutModal);
checkoutClose.addEventListener('click', closeCheckoutModal);

salesHistoryDismiss.addEventListener('click', closeSalesHistoryModal);
salesHistoryClose.addEventListener('click', closeSalesHistoryModal);

customerProfileDismiss.addEventListener('click', closeCustomerProfileModal);
customerProfileClose.addEventListener('click', closeCustomerProfileModal);

// --- NEW FEATURES EVENT LISTENERS ---
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

    // Optimistic UI update
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
    openSupplierDebtsModal(); // re-populate dropdown
    
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

// Debt Payment listeners
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

    // Optimistic UI updates
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

invoiceDetailsDismiss.addEventListener('click', closeInvoiceDetailsModal);
invoiceDetailsClose.addEventListener('click', closeInvoiceDetailsModal);

// Procurement System listeners
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

    // Optimistic UI updates: update local inventory and purchases list
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
    addToSyncQueue(payload);
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

    // Optimistically update local inventory
    returnCart.forEach(item => {
      const prod = inventory.find(p => p.id === item.productId);
      if (prod) {
        prod.qty += item.qty;
        prod.quantity += item.qty;
      }
    });
    
    // If method was Deduct from Debt, update customer debt locally
    if (selectedMethod === "خصم من الدين") {
      const cust = customers.find(c => c.id === activeReturnCustomer.id);
      if (cust) {
        cust.debt = Math.max(0, cust.debt - grandTotal);
      }
    }

    saveAllStatesToLocalStorage();
    closeAddReturnModal();
    showArabicToast("تم تسجيل المرتجع وتحديث المخزن بنجاح!", "success");
    renderCustomersList();
    renderInventoryList();
    renderSalesGrid();

    // Sync in background
    addToSyncQueue(payload);
  });
}

// Dynamic pricing listeners
checkoutDiscount.addEventListener('input', triggerCheckoutPricingRefresh);
checkoutReceivedInput.addEventListener('input', triggerCheckoutPricingRefresh);

// WHATSAPP SHORTCUT REDIRECT IN ADD CUSTOMER MODAL
cWhatsAppBtn.addEventListener('click', () => {
  const phoneVal = document.getElementById('c-phone').value.trim();
  triggerWhatsAppRedirect(phoneVal);
});

// SUBMIT: SAVE PRODUCT FORM (ADD NEW PRODUCT ONLY)
productForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const name = document.getElementById('p-name').value.trim();
  const barcode = document.getElementById('p-barcode').value.trim();
  const sell = parseFloat(document.getElementById('p-sell').value);
  const buy = parseFloat(document.getElementById('p-buy').value);
  const wholesale = 0;
  const unit = document.getElementById('p-unit').value;
  const qty = parseInt(document.getElementById('p-qty').value) || 0;

  if (!name || isNaN(sell) || isNaN(buy)) {
    showArabicToast('الرجاء إدخال الحقول المطلوبة بشكل صحيح', 'error');
    return;
  }

  // Create new item in mock database
  const newProd = {
    id: inventory.length > 0 ? Math.max(...inventory.map(p => p.id)) + 1 : 1,
    name,
    quantity: qty,
    qty,
    price: sell,
    sellPrice: sell,
    wholesalePrice: buy,
    costPrice: buy,
    category: 'الغذائيات',
    unit,
    barcode
  };

  inventory.push(newProd);

  // Send to Apps Script Backend
  const payload = {
    action: "addProduct",
    name: name,
    barcode: barcode,
    buyPrice: buy,
    sellPrice: sell,
    wholesalePrice: wholesale,
    category: unit,
    quantity: qty
  };

  saveAllStatesToLocalStorage();
  productForm.reset();
  closeProductModal();
  showArabicToast('تم حفظ المنتج بنجاح!', 'success');
  renderSalesGrid();
  renderInventoryList();

  // Sync in background
  addToSyncQueue(payload);
});

// SUBMIT: EDIT PRODUCT FORM (UPDATE PRODUCT)
if (editProductForm) {
  editProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingProduct) return;

    const originalName = editingProduct.name;
    const newName = editPName.value.trim();
    const barcode = editPBarcode.value.trim();
    const sellPrice = parseFloat(editPSell.value);
    const buyPrice = parseFloat(editPBuy.value);
    const wholesalePrice = 0;
    const category = editPCategory.value.trim();
    const quantity = parseInt(editPQty.value) || 0;

    if (!newName || isNaN(sellPrice) || isNaN(buyPrice) || !category) {
      showArabicToast('الرجاء إدخال الحقول المطلوبة بشكل صحيح', 'error');
      return;
    }

    const payload = {
      action: "updateProduct",
      oldName: originalName,
      name: newName,
      barcode: barcode,
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      wholesalePrice: wholesalePrice,
      category: category,
      quantity: quantity
    };

    // Update local state
    editingProduct.name = newName;
    editingProduct.barcode = barcode;
    editingProduct.sellPrice = sellPrice;
    editingProduct.price = sellPrice;
    editingProduct.costPrice = buyPrice;
    editingProduct.wholesalePrice = buyPrice;
    editingProduct.category = category;
    editingProduct.unit = category;
    editingProduct.qty = quantity;
    editingProduct.quantity = quantity;

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
      gps: editingCustomer.gps || ''
    };

    // Update local state
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

// SUBMIT: SAVE CUSTOMER FORM
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

  // Create customer in mock database
  const newCustomer = {
    id: customers.length > 0 ? Math.max(...customers.map(c => c.id)) + 1 : 1,
    name,
    address,
    phone,
    debt,
    gps: gpsVal
  };

  customers.push(newCustomer);

  // Send to Apps Script Backend
  const payload = {
    action: "addCustomer",
    shopName: name,
    address: address,
    phone: phone,
    debt: debt,
    gps: gpsVal
  };

  saveAllStatesToLocalStorage();
  customerForm.reset();
  closeCustomerModal();
  showArabicToast('تم حفظ العميل بنجاح!', 'success');
  renderCustomersList();

  // Sync in background
  addToSyncQueue(payload);
});

// Complete Cart Checkout triggers Complete sale modal
cartCompleteSaleBtn.addEventListener('click', openCheckoutModal);

// CONFIRM CHECKOUT FORM
checkoutConfirmBtn.addEventListener('click', async () => {
  // Disable button to prevent double submissions
  checkoutConfirmBtn.disabled = true;
  const originalBtnText = checkoutConfirmBtn.textContent;
  checkoutConfirmBtn.textContent = 'جاري الحفظ...';

  try {
    // 1. Calculate the actual cart total (subtotal of all items in the cart)
    let subtotal = 0;
    cart.forEach(item => {
      const prod = inventory.find(p => p.id === item.productId);
      if (prod) subtotal += prod.price * item.qty;
    });

    // 2. Safely read inputs
    const discountInput = document.getElementById('checkout-discount');
    const savingsInput = document.getElementById('checkout-savings');
    const receivedInput = document.getElementById('checkout-received-input');

    const discount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
    const savings = savingsInput ? (parseFloat(savingsInput.value) || 0) : 0;
    const received = receivedInput ? (parseFloat(receivedInput.value) || 0) : 0;
    const finalVal = Math.max(0, subtotal - discount);

    let customerName = 'عميل عام';
    let customer = null;

    // Check customer mode
    if (isQuickCustomerActive) {
      const quickNameInput = document.getElementById('checkout-quick-customer-name');
      const theNewName = quickNameInput ? quickNameInput.value.trim() : '';
      if (!theNewName) {
        showArabicToast('الرجاء إدخال اسم المحل الجديد', 'error');
        checkoutConfirmBtn.disabled = false;
        checkoutConfirmBtn.textContent = originalBtnText;
        return;
      }

      // Check GPS checkbox
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

      // Check if customer already exists locally
      const existing = customers.find(c => c.name.toLowerCase() === theNewName.toLowerCase());
      if (existing) {
        customer = existing;
        customerName = customer.name;
        if (received < finalVal) {
          customer.debt += (finalVal - received);
        }
      } else {
        // Create customer locally first
        const newCustomerId = customers.length > 0 ? Math.max(...customers.map(c => c.id)) + 1 : 1;
        customer = {
          id: newCustomerId,
          name: theNewName,
          address: "يكمل لاحقاً",
          phone: "-",
          debt: received < finalVal ? (finalVal - received) : 0,
          gps: gpsVal
        };
        customers.push(customer);
        customerName = theNewName;

        // Post request to create customer - queue it!
        const addCustomerPayload = {
          action: "addCustomer",
          shopName: theNewName,
          address: "يكمل لاحقاً",
          phone: "-",
          debt: 0,
          gps: gpsVal
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

      // Prompt for GPS if customer lacks location
      if (customer && !customer.gps) {
        if (await showCustomConfirm("هذا المحل غير مسجل جغرافياً، هل تريد حفظ موقعك الحالي للمحل؟")) {
          showArabicToast('جاري تحديد موقع GPS للمحل...', 'info');
          try {
            const gpsVal = await getCurrentLocation();
            
            const updatePayload = {
              action: "updateCustomer",
              oldShopName: customer.name,
              shopName: customer.name,
              address: customer.address,
              phone: customer.phone,
              gps: gpsVal
            };

            // Update locally
            customer.gps = gpsVal;
            showArabicToast('تم تسجيل الموقع الجغرافي للمحل بنجاح!', 'success');
            addToSyncQueue(updatePayload);
          } catch (err) {
            console.error("GPS error during checkout confirmation:", err);
            showArabicToast("فشل حفظ موقع GPS للمحل: " + err.message, "error");
          }
        }
      }
    }

    // 3. Determine status
    let statusText = 'مدفوع';
    if (received <= 0) {
      statusText = 'آجل';
    } else if (received < finalVal) {
      statusText = 'جزئي';
    }

    // 4. Generate unique invoice ID and capture current date
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const invoiceId = "INV-" + Date.now();

    // 5. Map the cart items to the format expected by the backend
    const cartArray = cart.map(item => {
      const prod = inventory.find(p => p.id === item.productId);
      return {
        name: prod ? prod.name : 'منتج غير معروف',
        qty: item.qty,
        price: prod ? prod.price : 0
      };
    });

    // 6. Append to local sales history
    const saleObject = {
      id: salesHistory.length > 0 ? Math.max(...salesHistory.map(s => s.id)) + 1 : 1,
      invoiceId: invoiceId,
      date: dateStr,
      customerName: customerName,
      totalAmount: finalVal,
      subtotal: subtotal,
      discount: discount,
      savings: savings,
      receivedAmount: received,
      status: statusText,
      items: cartArray
    };
    salesHistory.push(saleObject);

    // 7. Build payload for backend
    const addSalePayload = {
      action: "addSale",
      invoiceId: invoiceId,
      customerName: customerName,
      date: dateStr,
      totalAmount: subtotal,
      receivedAmount: received,
      discount: discount,
      savings: savings,
      status: statusText,
      items: cartArray,
      sellerName: activeUser ? activeUser['اسم المستخدم'] : 'بائع عام'
    };

    // 8. Clean up and open Options Modal
    cart = [];
    updateCartBadge();
    renderSalesGrid();
    renderCustomersList();
    closeCheckoutModal();
    saveAllStatesToLocalStorage();
    openInvoiceOptionsModal(saleObject, customer);

    // 9. Sync payload in background
    addToSyncQueue(addSalePayload);

  } catch (error) {
    console.error("Critical error in checkout confirm handler:", error);
    showArabicToast("حدث خطأ غير متوقع أثناء عملية البيع", "error");
  } finally {
    checkoutConfirmBtn.disabled = false;
    checkoutConfirmBtn.textContent = originalBtnText;
  }
});

successModalDoneBtn.addEventListener('click', () => {
  successDoneModal.classList.add('hidden');
  switchView('sales');
});

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
    if (printSection) {
      printSection.innerHTML = generatePrintReceipt(lastCompletedSale, lastCompletedCustomer);
    }
    window.print();
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

      loadInitialData(true).catch(() => {}).finally(() => {
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
  loadInitialData(true).catch(() => {});
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
  if (recognition) {
    recognition.stop();
  }
  if (smartAiModal) {
    smartAiModal.classList.add('hidden');
  }
};

let recognition = null;
let isRecording = false;
let isRetryingSpeech = false;
let hasRetriedOnNetworkError = false;

const initSpeechRecognition = () => {
  try {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Web Speech API is not supported in this browser.");
      return;
    }

    recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
  
  // Force Arabic (Iraqi) language directly
  recognition.lang = 'ar-IQ';

  recognition.onstart = () => {
    isRecording = true;
    if (aiMicStatusDot) aiMicStatusDot.classList.remove('hidden');
    if (aiMicBtnText) aiMicBtnText.textContent = 'جارٍ الاستماع... (انقر للتوقف)';
    if (aiMicBtn) {
      aiMicBtn.classList.add('bg-red-50', 'text-red-600', 'border-red-200', 'mic-active-pulse');
    }
    if (headerSmartAiBtn) {
      headerSmartAiBtn.classList.add('mic-active-pulse');
    }
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        transcript += event.results[i][0].transcript;
      }
    }
    
    transcript = transcript.trim();
    if (!transcript) return;

    console.log('Recognized Speech:', transcript);

    const activeInput = getActiveSearchInput();
    if (activeInput) {
      if (activeInput === aiTextInput) {
        activeInput.value = (activeInput.value + ' ' + transcript).trim();
      } else {
        activeInput.value = transcript;
        // Dispatch the input event immediately so search filtering works
        activeInput.dispatchEvent(new Event('input'));
      }
    }

    // Stop recognition to reset UI state after successful parsing
    stopRecording();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error event details:", event.error, event);

    if (event.error === 'network') {
      console.warn("Speech recognition error details: network");
      if (!hasRetriedOnNetworkError) {
        hasRetriedOnNetworkError = true;
        isRetryingSpeech = true;
        console.log("Attempting automatic retry to start speech recognition...");
        showArabicToast("فشل الاتصال بالصوت. جاري المحاولة تلقائياً بعد قليل...", "info");

        setTimeout(() => {
          if (isRecording) {
            try {
              recognition.start();
            } catch (e) {
              console.error("Speech recognition retry start failed:", e);
              showArabicToast("فشل في إعادة المحاولة: " + e.message, "error");
              stopRecording();
            }
          }
        }, 600);
        return;
      }
    } else if (event.error === 'no-speech') {
      console.warn("Speech recognition error details: no-speech (no voice detected). Keeping mic active...");
      isRetryingSpeech = true;
      setTimeout(() => {
        if (isRecording) {
          try {
            recognition.start();
          } catch (e) {
            console.error("Speech recognition restart after no-speech failed:", e);
          }
        }
      }, 100);
      return;
    }

    showArabicToast("فشل في التقاط الصوت: " + event.error, "error");
    stopRecording();
  };

  recognition.onend = () => {
    if (isRetryingSpeech) {
      isRetryingSpeech = false;
      return;
    }
    // Keep persistent listening active if the user hasn't explicitly stopped
    if (isRecording) {
      console.log("Speech recognition ended unexpectedly while isRecording is true. Restarting...");
      try {
        recognition.start();
      } catch (e) {
        console.error("Speech recognition restart inside onend failed:", e);
        stopRecording();
      }
    } else {
      stopRecording();
    }
  };
} catch (error) {
  console.error("Speech recognition initialization failed:", error);
  showArabicToast("فشل تهيئة التعرف على الصوت", "error");
}
};

const startRecording = async () => {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  } catch (err) {
    console.error("Microphone permission denied or error:", err);
    showArabicToast("يجب السماح بالوصول إلى الميكروفون لاستخدام هذه الميزة", "error");
    stopRecording();
    return;
  }

  hasRetriedOnNetworkError = false;
  isRetryingSpeech = false;

  if (!recognition) {
    initSpeechRecognition();
  }

  // Add 500ms delay to allow device streams to synchronize before recognition start
  if (aiMicBtnText) aiMicBtnText.textContent = 'جاري تهيئة الميكروفون...';
  await new Promise(resolve => setTimeout(resolve, 500));

  if (recognition) {
    try {
      recognition.start();
    } catch (e) {
      console.error("Speech recognition start failed:", e);
      showArabicToast("فشل بدء التعرف على الصوت: " + e.message, "error");
      stopRecording();
    }
  } else {
    showArabicToast("تصفحك لا يدعم ميزة التعرف على الصوت", "error");
  }
};

const stopRecording = () => {
  isRecording = false;
  if (aiMicStatusDot) aiMicStatusDot.classList.add('hidden');
  if (aiMicBtnText) aiMicBtnText.textContent = '🎤 تحدث بصوتك';
  if (aiMicBtn) {
    aiMicBtn.classList.remove('bg-red-50', 'text-red-600', 'border-red-200', 'mic-active-pulse');
  }
  if (headerSmartAiBtn) {
    headerSmartAiBtn.classList.remove('mic-active-pulse');
  }
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.error(e);
    }
  }
};

const toggleRecording = async () => {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
};

const executeAiCommand = async () => {
  const text = aiTextInput.value.trim();
  if (!text) {
    showArabicToast("الرجاء كتابة طلب أو التحدث أولاً", "error");
    return;
  }

  if (isRecording) {
    stopRecording();
  }

  if (aiLoadingState) aiLoadingState.classList.remove('hidden');
  if (aiExecuteBtn) aiExecuteBtn.disabled = true;

  const payload = {
    action: "analyzeText",
    text: text
  };

  try {
    console.log("Sending AI text analysis request to:", BACKEND_URL);
    console.log("Payload:", payload);

    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const result = await response.json();
    console.log("AI analysis response result:", result);
    
    if (result.status === "error") {
      await showCustomAlert("خطأ من السيرفر: " + result.message);
      return;
    }

    if (result.status === "success" && result.aiData) {
      const aiData = result.aiData;
      
      // Client-side scanning fallback:
      // Scan local inventory names against transcription text; default quantity to 1 if the item name is present in transcription but absent from the backend parsed aiData.items.
      if (!aiData.items) aiData.items = [];
      inventory.forEach(prod => {
        if (text.toLowerCase().includes(prod.name.toLowerCase())) {
          const alreadyMatched = aiData.items.some(aiItem => 
            aiItem.name.toLowerCase().includes(prod.name.toLowerCase()) || 
            prod.name.toLowerCase().includes(aiItem.name.toLowerCase())
          );
          if (!alreadyMatched) {
            aiData.items.push({
              name: prod.name,
              qty: 1
            });
          }
        }
      });
      
      if (aiData.customerName) {
        const match = customers.find(c => 
          c.name.toLowerCase().includes(aiData.customerName.toLowerCase()) ||
          aiData.customerName.toLowerCase().includes(c.name.toLowerCase())
        );
        if (match) {
          toggleQuickCustomerMode(false);
          checkoutCustomerSelect.value = match.id;
        } else {
          toggleQuickCustomerMode(true);
          checkoutQuickCustomerName.value = aiData.customerName;
          showArabicToast(`تم تفعيل الإضافة السريعة للمحل "${aiData.customerName}"`, "info");
        }
      }

      if (aiData.items && Array.isArray(aiData.items) && aiData.items.length > 0) {
        cart.forEach(item => {
          const prod = inventory.find(p => p.id === item.productId);
          if (prod) {
            prod.qty += item.qty;
            prod.quantity += item.qty;
          }
        });
        cart = [];

        aiData.items.forEach(aiItem => {
          const prod = inventory.find(p => 
            p.name.toLowerCase().includes(aiItem.name.toLowerCase()) ||
            aiItem.name.toLowerCase().includes(p.name.toLowerCase())
          );
          if (prod) {
            const qtyToAdd = parseInt(aiItem.qty) || 1;
            const actualQty = Math.min(prod.quantity, qtyToAdd);
            if (actualQty > 0) {
              prod.qty -= actualQty;
              prod.quantity -= actualQty;
              cart.push({
                productId: prod.id,
                qty: actualQty
              });
              if (actualQty < qtyToAdd) {
                showArabicToast(`تمت إضافة ${actualQty} فقط من "${prod.name}" لنفاد المخزون`, "info");
              }
            } else {
              showArabicToast(`المنتج "${prod.name}" نفد من المخزن!`, "error");
            }
          } else {
            showArabicToast(`لم يتم العثور على منتج باسم "${aiItem.name}"`, "error");
          }
        });

        updateCartBadge();
        renderSalesGrid();
        renderCartRows();
      }

      if (aiData.paidAmount !== undefined && aiData.paidAmount !== null) {
        checkoutReceivedInput.value = aiData.paidAmount;
      }

      let sum = 0;
      cart.forEach(item => {
        const prod = inventory.find(p => p.id === item.productId);
        if (prod) sum += prod.price * item.qty;
      });
      checkoutSubtotalVal.textContent = `${sum.toLocaleString()} د.ع`;
      checkoutFinalVal.textContent = `${sum.toLocaleString()} د.ع`;
      triggerCheckoutPricingRefresh();

      closeSmartAiModal();
      openCheckoutModal(true);
      showArabicToast("تم ملء الفاتورة بواسطة الذكاء الاصطناعي بنجاح!", "success");
    } else {
      await showCustomAlert("فشل في تحليل النص: استجابة غير معروفة");
    }
  } catch (err) {
    console.error("AI assistant network/fetch error details:", err);
    showArabicToast("فشل الاتصال بمساعد الذكاء الاصطناعي: " + err.message, "error");
    await showCustomAlert("حدث خطأ أثناء الاتصال بالذكاء الاصطناعي: " + err.message);
  } finally {
    if (aiLoadingState) aiLoadingState.classList.add('hidden');
    if (aiExecuteBtn) aiExecuteBtn.disabled = false;
  }
};

// Bind listeners
if (smartAiBtn) smartAiBtn.addEventListener('click', openSmartAiModal);
if (headerSmartAiBtn) headerSmartAiBtn.addEventListener('click', toggleRecording);
if (checkoutQuickCustomerBtn) {
  checkoutQuickCustomerBtn.addEventListener('click', () => toggleQuickCustomerMode());
}
if (smartAiClose) smartAiClose.addEventListener('click', closeSmartAiModal);
if (aiMicBtn) aiMicBtn.addEventListener('click', toggleRecording);
if (aiExecuteBtn) aiExecuteBtn.addEventListener('click', executeAiCommand);

// Checkout modal back button listener
const checkoutBackBtn = document.getElementById('checkout-back-btn');
if (checkoutBackBtn) {
  checkoutBackBtn.addEventListener('click', () => {
    closeCheckoutModal();
  });
}

// Add Product form Unit chips selector bindings
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

if (headerDarkModeBtn) {
  headerDarkModeBtn.addEventListener('click', () => {
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
  customCustomerDropdownSearch.addEventListener('input', () => {
    renderCustomCustomerDropdownItems();
  });
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
      <span>${c.name} <span class="text-[9px] text-gray-400 font-bold mr-1">(${c.address})</span></span>
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
let scannerTarget = 'cart'; // 'cart', 'addProductBarcode', or 'editProductBarcode'

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
      // Prioritize primary rear camera lens device id
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
        fps: 30, // scan at high frame rate
        qrbox: (width, height) => {
          const size = Math.min(width, height) * 0.7;
          return { width: size, height: size };
        },
        aspectRatio: 1.777778, // widescreen mode
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
      // Direct environment fallback
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
    // Direct environment fallback if getCameras fails
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
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); // 800Hz beep tone
      
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
  if (!headerDarkModeBtn) return;
  const isDark = document.documentElement.classList.contains('dark');
  const icon = headerDarkModeBtn.querySelector('i');
  if (icon) {
    if (isDark) {
      icon.className = 'fa-solid fa-sun text-lg text-yellow-300';
    } else {
      icon.className = 'fa-solid fa-moon text-lg';
    }
  }
};

const onCameraScanSuccess = (decodedText, decodedResult) => {
  console.log(`Barcode scanned successfully: ${decodedText}`, decodedResult);
  
  // Play synthetic beep and haptic feedback
  playBeep();
  
  // Immediately stop the scanner
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
    // Search the local products array for a product barcode match
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

const onCameraScanFailure = (error) => {
  // Silent scan failure callback
};

// Bind scanner and local search listeners
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
if (salesSearchBar) {
  salesSearchBar.addEventListener('input', () => {
    renderSalesGrid();
  });
}

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

    // Set button loading state
    if (loginSubmitBtn) {
      loginSubmitBtn.disabled = true;
      loginSubmitBtn.textContent = 'جاري التحقق...';
    }

    let fetchError = null;
    try {
      // Restore fetch request to verify credentials against backend
      await loadInitialData(true, username, password);
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

      applyRBACRules(); // Apply RBAC rules on successful login

      renderInventoryList();
      renderCustomersList();
      renderSalesGrid();

      // Silently fetch latest data in background to refresh views (SWR)
      loadInitialData(true).catch(() => {});
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
    // Restore button state
    if (loginSubmitBtn) {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'دخول';
    }
  }
};

// Bind login triggers
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

// Bind Logout buttons
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

// --- INITIALIZER STARTUP ---
const initApp = () => {
  // Check active user session first
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
  // Sync the dark mode toggle icon state on start
  updateThemeIcon();

  // 1. Instantly load states from local cache (0ms delay UI)
  loadStatesFromLocalStorage();
  
  // 2. Render initial view grids immediately
  renderInventoryList();
  renderCustomersList();
  renderSalesGrid();

  // Start on Sales View
  switchView('sales');
  updateCartBadge();

  if (activeUser) {
    applyRBACRules(); // Apply RBAC rules immediately on restore
  }

  // 3. Fetch latest data in the background silently
  loadInitialData(true).catch(() => {});
  
  // 4. Trigger sync for any pending offline items
  processSyncQueue();
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

