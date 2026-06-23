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
  var requestData = JSON.parse(e.postData.contents);
  
  // Token verification
  if (requestData.token !== "POS_AUTH_KEY_2026") {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized token" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var action = requestData.action;
  var customersSheet = ss.getSheetByName("العملاء");
  var result = { status: "success" };

  switch (action) {
      case "smart_voice":
      case "analyzeText":
        if (!requestData.text) {
          result = { status: "error", message: "لم يتم إرسال نص للتحليل" };
        } else {
          result = { status: "success", aiData: callGeminiWithRetry(requestData.text) };
        }
        break;
      case "smart_voice_audio":
        if (!requestData.audioBase64 || !requestData.mimeType) {
          result = { status: "error", message: "Missing audio data" };
        } else {
          result = { status: "success", aiData: callGeminiWithRetry(null, requestData.audioBase64, requestData.mimeType) };
        }
        break;
    case "addCustomer":
      addCustomerRaw(customersSheet, requestData);
      break;
    case "updateCustomer":
      var values = customersSheet.getDataRange().getValues();
      updateCustomerRaw(customersSheet, requestData.oldShopName, requestData, values);
      break;
    case "addProduct":
      addProductRaw(ss, requestData);
      break;
    case "updateProduct":
      updateProductRaw(ss, requestData.oldName, requestData);
      break;
    case "deleteProduct":
      deleteProductRaw(ss, requestData.name);
      break;
    case "addSale":
      addSaleRaw(ss, requestData);
      break;
    case "addPurchase":
      addPurchaseRaw(ss, requestData);
      break;
    case "addReturn":
      addReturnRaw(ss, requestData);
      break;
    default:
      result = { status: "error", message: "Unknown action" };
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
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

function callGeminiWithRetry(text, audioBase64, audioMimeType) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=" + GEMINI_API_KEY;
  
  const systemInstruction = `You are a smart POS assistant for an Iraqi distribution van.
The user will speak in Iraqi Arabic (e.g., "نزلت لسنتر تبارك 2 برغر لحم و 4 كرسبي").
Your job is to extract the customer's shop name and the items with their exact quantities.
Ignore filler words.
You MUST return ONLY a raw JSON object. No markdown, no \`\`\`json, no explanations.
Format: {"customer": "اسم المحل", "items": [{"name": "اسم المادة", "qty": رقم}]}`;
  
  let partsArray = [{ text: systemInstruction }];
  
  if (audioBase64 && audioMimeType) {
    partsArray.push({
      inlineData: { mimeType: audioMimeType, data: audioBase64 }
    });
    partsArray.push({ text: "Extract the customer and items from this audio." });
  } else if (text) {
    partsArray.push({ text: "Text to parse: " + text });
  }

  const payload = { 
    contents: [{ parts: partsArray }], 
    generationConfig: { responseMimeType: "application/json" } 
  };
  
  const options = { 
    method: "post", 
    contentType: "application/json", 
    payload: JSON.stringify(payload), 
    muteHttpExceptions: true 
  };

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      if (response.getResponseCode() === 200) {
        let rawText = JSON.parse(response.getContentText()).candidates[0].content.parts[0].text.trim();
        rawText = rawText.replace(/^```(json)?\s*/i, "").replace(/```$/i, "").trim();
        const parsedData = JSON.parse(rawText);
        if (parsedData && !parsedData.customer && parsedData.customerName) {
          parsedData.customer = parsedData.customerName;
        }
        return parsedData;
      }
      throw new Error("Gemini Error Status Code: " + response.getResponseCode());
    } catch (err) {
      lastError = err;
      if (attempt < 3) Utilities.sleep(1500); 
    }
  }
  throw new Error("فشل الاتصال بذكاء جيميناي بعد 3 محاولات: " + lastError.toString());
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
