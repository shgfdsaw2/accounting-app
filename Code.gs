/**
 * Google Apps Script Backend for POS system.
 * Separated into products profiles ("المنتجات") and stock ("المخزون").
 */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var customersSheet = ss.getSheetByName("العملاء");
  
  var data = {
    products: getProductsData(ss),
    customers: getCustomersData(customersSheet)
  };
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var postData = JSON.parse(e.postData.contents);
  
  // Token verification
  if (postData.token !== "POS_AUTH_KEY_2026") {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized token" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var action = postData.action;
  var customersSheet = ss.getSheetByName("العملاء");
  
  if (action === "addCustomer") {
    addCustomerRaw(customersSheet, postData);
  } else if (action === "updateCustomer") {
    var values = customersSheet.getDataRange().getValues();
    updateCustomerRaw(customersSheet, postData.oldShopName, postData, values);
  } else if (action === "addProduct") {
    addProductRaw(ss, postData);
  } else if (action === "updateProduct") {
    updateProductRaw(ss, postData.oldName, postData);
  } else if (action === "deleteProduct") {
    deleteProductRaw(ss, postData.name);
  } else if (action === "addSale") {
    addSaleRaw(ss, postData);
  } else if (action === "addPurchase") {
    addPurchaseRaw(ss, postData);
  } else if (action === "addReturn") {
    addReturnRaw(ss, postData);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function addCustomerRaw(sheet, data) {
  // Writes: Shop Name (Col A), Address (Col B), Phone (Col C), Debt (Col D), Latitude (Col E), Longitude (Col F)
  sheet.appendRow([
    data.shopName,
    data.address || "",
    String(data.phone || ""),
    parseFloat(data.debt) || 0,
    data.latitude || "",
    data.longitude || ""
  ]);
}

function updateCustomerRaw(sheet, oldShopName, data, values) {
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === oldShopName) {
      sheet.getRange(i + 1, 1, 1, 6).setValues([[
        data.shopName,
        data.address || "",
        String(data.phone || ""),
        data.debt !== undefined ? parseFloat(data.debt) : parseFloat(values[i][3]),
        data.latitude || "",
        data.longitude || ""
      ]]);
      break;
    }
  }
}

function getCustomersData(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var customers = [];
  for (var i = 1; i < data.length; i++) {
    customers.push({
      "اسم المحل": data[i][0], // Column A: Shop Name
      "العنوان": data[i][1],  // Column B: Address
      "رقم الهاتف": data[i][2], // Column C: Phone
      "الديون": parseFloat(data[i][3]) || 0, // Column D: Debt
      "Latitude": parseFloat(data[i][4]) || 0,  // Column E: Latitude
      "Longitude": parseFloat(data[i][5]) || 0 // Column F: Longitude
    });
  }
  return customers;
}

function getProductsData(ss) {
  var prodSheet = ss.getSheetByName("المنتجات");
  var stockSheet = ss.getSheetByName("المخزون");
  if (!prodSheet || !stockSheet) return [];
  
  var prodData = prodSheet.getDataRange().getValues();
  var stockData = stockSheet.getDataRange().getValues();
  
  var stockMap = {};
  for (var i = 1; i < stockData.length; i++) {
    var name = stockData[i][0];
    if (name) {
      stockMap[name] = parseFloat(stockData[i][1]) || 0;
    }
  }
  
  var products = [];
  for (var j = 1; j < prodData.length; j++) {
    var name = prodData[j][0];
    if (name) {
      var barcode = prodData[j][1] || "";
      var buyPrice = parseFloat(prodData[j][2]) || 0; // Col C: Buy Price (سعر الشراء) -> buyPrice
      var sellPrice = parseFloat(prodData[j][3]) || 0; // Col D: Sell Price (سعر البيع) -> wholesalePrice
      var wholesalePrice = parseFloat(prodData[j][4]) || 0; // Col E: Wholesale Price (سعر الجملة) -> sellPrice
      var category = prodData[j][5] || "";
      var quantity = stockMap[name] !== undefined ? stockMap[name] : 0;
      
      products.push({
        name: name,
        barcode: barcode,
        buyPrice: buyPrice,
        wholesalePrice: sellPrice,
        sellPrice: wholesalePrice,
        price: wholesalePrice, // default retail price for compatibility
        category: category,
        quantity: quantity
      });
    }
  }
  return products;
}

function addProductRaw(ss, data) {
  var prodSheet = ss.getSheetByName("المنتجات");
  var stockSheet = ss.getSheetByName("المخزون");
  if (!prodSheet || !stockSheet) return;
  
  // Name, Barcode, Buy Price, Sell Price (Standard Sale), Wholesale Price (Retail), Category
  prodSheet.appendRow([
    data.name,
    data.barcode || "",
    parseFloat(data.buyPrice) || 0,
    parseFloat(data.wholesalePrice) || 0,
    parseFloat(data.sellPrice) || 0,
    data.category || ""
  ]);
  
  // Name, Quantity
  stockSheet.appendRow([
    data.name,
    parseFloat(data.quantity) || 0
  ]);
}

function updateProductRaw(ss, oldName, data) {
  var prodSheet = ss.getSheetByName("المنتجات");
  var stockSheet = ss.getSheetByName("المخزون");
  if (!prodSheet || !stockSheet) return;
  
  // Update specs in "المنتجات"
  var prodValues = prodSheet.getDataRange().getValues();
  for (var i = 1; i < prodValues.length; i++) {
    if (prodValues[i][0] === oldName) {
      prodSheet.getRange(i + 1, 1, 1, 6).setValues([[
        data.name,
        data.barcode || "",
        parseFloat(data.buyPrice) || 0,
        parseFloat(data.wholesalePrice) || 0,
        parseFloat(data.sellPrice) || 0,
        data.category || ""
      ]]);
      break;
    }
  }
  
  // Update quantity and name in "المخزون"
  var stockValues = stockSheet.getDataRange().getValues();
  var nameFoundInStock = false;
  for (var j = 1; j < stockValues.length; j++) {
    if (stockValues[j][0] === oldName) {
      stockSheet.getRange(j + 1, 1, 1, 2).setValues([[
        data.name,
        parseFloat(data.quantity) || 0
      ]]);
      nameFoundInStock = true;
      break;
    }
  }
  if (!nameFoundInStock) {
    stockSheet.appendRow([
      data.name,
      parseFloat(data.quantity) || 0
    ]);
  }
}

function deleteProductRaw(ss, name) {
  var prodSheet = ss.getSheetByName("المنتجات");
  var stockSheet = ss.getSheetByName("المخزون");
  if (!prodSheet || !stockSheet) return;
  
  var prodValues = prodSheet.getDataRange().getValues();
  for (var i = 1; i < prodValues.length; i++) {
    if (prodValues[i][0] === name) {
      prodSheet.deleteRow(i + 1);
      break;
    }
  }
  
  var stockValues = stockSheet.getDataRange().getValues();
  for (var j = 1; j < stockValues.length; j++) {
    if (stockValues[j][0] === name) {
      stockSheet.deleteRow(j + 1);
      break;
    }
  }
}

function addSaleRaw(ss, data) {
  var stockSheet = ss.getSheetByName("المخزون");
  if (!stockSheet) return;
  var values = stockSheet.getDataRange().getValues();
  
  data.items.forEach(function(item) {
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === item.name) {
        var currentQty = parseFloat(values[i][1]) || 0;
        var newQty = currentQty - (parseFloat(item.qty) || 0);
        stockSheet.getRange(i + 1, 2).setValue(newQty);
        values[i][1] = newQty;
        break;
      }
    }
  });
}

function addPurchaseRaw(ss, data) {
  var stockSheet = ss.getSheetByName("المخزون");
  if (!stockSheet) return;
  var values = stockSheet.getDataRange().getValues();
  
  data.items.forEach(function(item) {
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === item.name) {
        var currentQty = parseFloat(values[i][1]) || 0;
        var newQty = currentQty + (parseFloat(item.qty) || 0);
        stockSheet.getRange(i + 1, 2).setValue(newQty);
        values[i][1] = newQty;
        break;
      }
    }
  });
}

function addReturnRaw(ss, data) {
  var stockSheet = ss.getSheetByName("المخزون");
  if (!stockSheet) return;
  var values = stockSheet.getDataRange().getValues();
  
  data.items.forEach(function(item) {
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === item.name) {
        var currentQty = parseFloat(values[i][1]) || 0;
        var newQty = currentQty + (parseFloat(item.qty) || 0);
        stockSheet.getRange(i + 1, 2).setValue(newQty);
        values[i][1] = newQty;
        break;
      }
    }
  });
}

function callGeminiWithRetry(text) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=" +
    GEMINI_API_KEY;

  const systemPrompt =
    'You are a JSON-only extraction engine for an Iraqi van-sales POS system. ' +
    'The user speaks Iraqi Arabic dialect. Examples:\n' +
    '"نزلت لسنتر تبارك 2 برغر لحم و 4 كرسبي" → {"customer":"سنتر تبارك","items":[{"name":"برغر لحم","qty":2},{"name":"كرسبي","qty":4}]}\n' +
    '"انطيت لاسواق الوادي كارتونين كبة" → {"customer":"اسواق الوادي","items":[{"name":"كبة","qty":2}]}\n' +
    'Rules:\n' +
    '1. Output RAW JSON ONLY — zero markdown, zero backticks, zero prose.\n' +
    '2. Schema: {"customer":"string","items":[{"name":"string","qty":integer}]}\n' +
    '3. "qty" must be a number, never a string.\n' +
    '4. Customer field uses the shop/place name the salesman visited.\n' +
    '5. Filler words (روحت، نزلت، انطيت، وديت، جبت) are irrelevant — ignore them.\n' +
    '6. If quantity words appear (كارتون/كرتون=1, زوج=2, نص كرتون=0.5→round up to 1) convert them.\n' +
    'DO NOT wrap output in ```json``` or any other text.';

  const payload = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          { text: "Input: " + text }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 512
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const RETRY_DELAYS = [0, 1500, 3000]; 
  let lastError = null;

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (RETRY_DELAYS[attempt] > 0) Utilities.sleep(RETRY_DELAYS[attempt]);

    try {
      const response = UrlFetchApp.fetch(url, options);
      const httpCode = response.getResponseCode();

      if (httpCode === 429) {
        Utilities.sleep(4000);
        lastError = new Error("Gemini rate-limited (429)");
        continue;
      }

      if (httpCode !== 200) {
        lastError = new Error("Gemini HTTP " + httpCode + ": " + response.getContentText().slice(0, 200));
        continue;
      }

      const rawBody = response.getContentText();
      const bodyJson = JSON.parse(rawBody);

      const candidate = (bodyJson.candidates || [])[0];
      if (!candidate) {
        lastError = new Error("Gemini returned no candidates");
        continue;
      }

      if (candidate.finishReason === "SAFETY") {
        throw new Error("Gemini blocked the request due to safety filters");
      }

      const rawText = ((candidate.content || {}).parts || [{}])[0].text || "";

      const parsed = _sanitizeAndParseGeminiJson(rawText);
      if (!parsed) {
        lastError = new Error("JSON extraction failed from Gemini response: " + rawText.slice(0, 300));
        continue;
      }

      return _normalizeAiResponse(parsed);

    } catch (err) {
      lastError = err;
      if (err.message && err.message.includes("safety")) throw err;
    }
  }

  throw new Error(
    "فشل الاتصال بجيميناي بعد " + RETRY_DELAYS.length + " محاولات — " +
    (lastError ? lastError.message : "خطأ مجهول")
  );
}

function _sanitizeAndParseGeminiJson(raw) {
  if (!raw || typeof raw !== "string") return null;

  let s = raw.trim();
  s = s.replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/i, "").trim();
  s = s.replace(/`/g, "").replace(/[\u200f\u200e\u202a\u202c\ufeff]/g, "").trim();

  try { return JSON.parse(s); } catch (_) {}

  const objMatch = s.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch (_) {}
  }

  try {
    const fixed = s
      .replace(/'/g, '"')                                      
      .replace(/,\s*([}\]])/g, '$1')                           
      .replace(/([{,]\s*)(\w[\u0600-\u06FF\w]*)\s*:/g, '$1"$2":'); 
    return JSON.parse(fixed);
  } catch (_) {}

  return null;
}

function _normalizeAiResponse(obj) {
  if (!obj || typeof obj !== "object") return { customer: "", items: [] };

  const customer = String(
    obj.customer || obj.customerName || obj.shop || obj.shopName ||
    obj["العميل"] || obj["المحل"] || ""
  ).trim();

  let items = [];
  const rawItems = obj.items || obj.products || obj["المواد"] || obj["المنتجات"] || [];

  if (Array.isArray(rawItems)) {
    items = rawItems
      .map(item => {
        if (!item || typeof item !== "object") return null;
        const name = String(
          item.name || item.product || item["الاسم"] || item["المادة"] || item["المنتج"] || ""
        ).trim();
        const qty = Math.max(1, Math.round(parseFloat(item.qty || item.quantity || item["الكمية"] || 1) || 1));
        return name ? { name, qty } : null;
      })
      .filter(Boolean);
  }

  return { customer, items };
}
