const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const app = express();
app.use(express.json());
const jwt = require("jsonwebtoken");
const EventEmitter = require("events");
const eventEmitter = new EventEmitter();

// consider loading your public key from a file or an environment variable
const PUBLIC_KEY = process.env.PUBLIC_KEY.replace(/\\n/g, "\n");
const apiKey = process.env.DELHIVERY_API_KEY;
const authToken = process.env.AUTH_TOKEN;
const siteId = process.env.WIXSITE_ID;

// check pincode serviceability------
async function getServiceablePincodes(pincode) {
  try {
    const response = await axios.get(
      `https://track.delhivery.com/c/api/pin-codes/json/?filter_codes=${pincode}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${apiKey}`,
        },
      }
    );
    console.log("pincode---", response.data);
    return response?.data;
  } catch (error) {
    throw error;
  }
}

// Create Shipment Order-----
async function createShipment(
  InstanceId,
  orderId,
  billingInfo,
  lineItems,
  createdDate,
  priceSummary,
  paymentStatus,
  recipientInfo,
  entityId
) {
  const warehouse = await prisma.warehouse.findUnique({
    where: {
      instanceId: "2d2091eb-e932-48cb-b964-875632831135",
    },
  });

  console.log("warehouse details:", warehouse);

  const { contactDetails, address } = recipientInfo;

  const formatPhoneNumber = (phone) => {
    return phone ? phone.replace(/\D/g, "") : "";
  };

  // const calculateCODPrice = () => {
  //   return parseFloat(priceSummary.shipping.amount) == 0
  //     ? parseFloat(priceSummary.total.amount) + 40
  //     : parseFloat(priceSummary.total.amount);
  // };

  // Calculate total weight in grams
  const totalWeightInGrams = lineItems.reduce((totalWeight, item) => {
    const weightKg = item.physicalProperties?.weight || 0;
    const quantity = item.quantity || 1;
    return totalWeight + weightKg * quantity * 1000;
  }, 0);

  const formatProductDesc = (lineItems) => {
    return lineItems.map((item) => item.productName.original).join(", ");
  };

  const payload = {
    name: `${contactDetails?.firstName} ${contactDetails?.lastName}`,
    add: address?.addressLine2
      ? `${address?.addressLine},${address?.addressLine2}`
      : address?.addressLine,
    pin: address?.postalCode,
    city: address?.city,
    state: "",
    country: "",
    phone: formatPhoneNumber(contactDetails?.phone),
    order: orderId,
    payment_mode: "Prepaid",
    return_pin: "",
    return_city: "",
    return_phone: "",
    return_add: "",
    return_state: "",
    return_country: "",

    products_desc: formatProductDesc(lineItems),
    hsn_code: "",
    cod_amount: "",
    order_date: new Date(createdDate).toISOString().split("T")[0],
    total_amount: priceSummary.total.amount,
    seller_add: warehouse.address,
    seller_name: warehouse.name,
    seller_inv: "",
    quantity: lineItems.reduce((acc, item) => acc + item.quantity, 0),
    waybill: "",
    shipment_width: "5",
    shipment_height: "30",
    shipment_length: "25",
    weight: totalWeightInGrams.toString(),
    seller_gst_tin: "",
    shipping_mode: warehouse.shipping_mode,
    address_type: "",
  };

  console.log("Payload for Create Order:", JSON.stringify(payload, null, 2));

  const pickupLocation = {
    name: warehouse.warehouse_name,
    add: warehouse.address,
    city: warehouse.city,
    pin_code: warehouse.pincode,
    country: warehouse.country,
    phone: warehouse.phone,
  };

  console.log("Pickup:", pickupLocation);

  const customerInfo = await prisma.customer_shipment.upsert({
    where: { orderID: orderId },
    update: {
      // Update fields here if `orderID` exists
      customer_name: `${contactDetails?.firstName} ${contactDetails?.lastName}`,
      address: address?.addressLine2
        ? `${address?.addressLine},${address?.addressLine2}`
        : address?.addressLine,
      phone: formatPhoneNumber(contactDetails?.phone),
      pincode: address?.postalCode,
      shipment_mode: warehouse.shipping_mode,
      length: 30,
      height: 25,
      weight: totalWeightInGrams,
      product_desc: formatProductDesc(lineItems),
      business_name: warehouse.warehouse_name,
    },
    create: {
      // Create new record if `orderID` doesn't exist
      orderID: orderId,
      customer_name: `${contactDetails?.firstName} ${contactDetails?.lastName}`,
      address: address?.addressLine2
        ? `${address?.addressLine},${address?.addressLine2}`
        : address?.addressLine,
      phone: contactDetails?.phone,
      pincode: address?.postalCode,
      shipment_mode: warehouse.shipping_mode,
      length: 30,
      height: 25,
      weight: totalWeightInGrams,
      product_desc: formatProductDesc(lineItems),
      business_name: warehouse.warehouse_name,
    },
  });

  console.log("customer Info:---", customerInfo);

  // Api request for order create-----
  const url = "https://track.delhivery.com/api/cmu/create.json";
  const headers = {
    "Content-Type": "text/plain",
    Accept: "*/*",
    Authorization: `Token ${apiKey}`,
  };
  const sendPayload = {
    format: "json",
    data: {
      shipments: [payload],
      pickup_location: pickupLocation,
    },
  };
  const formattedPayload = `format=json&data=${JSON.stringify(
    sendPayload.data
  )}`;

  // console.log("formatted payload:", formattedPayload);
  // return;
  try {
    const response = await axios.post(url, formattedPayload, { headers });

    const packageInfo = response.data?.packages[0];
    const refnum = packageInfo?.refnum; // Order ID
    const waybill = packageInfo?.waybill; // Tracking number
    const status = packageInfo?.status;
    const remarks = packageInfo?.remarks[0];

    // Update database entry in Prisma
    const updatedShipment = await prisma.customer_shipment.updateMany({
      where: { orderID: refnum },
      data: {
        waybill: waybill || null,
        status: status || null,
        order_json: response.data || null,
      },
    });

    console.log("updateship", updatedShipment);
    
    if (response.data.success != true) {
      console.log("Error Creating Shippment");
      console.log("resp of order failed:", response.data);

      // Send WhatsApp Notification to Client on Failure
      await sendShipmentFailureNotification(
        refnum,
        remarks,
        formatPhoneNumber(contactDetails?.phone)
      );
    } else {
      console.log("Shippment Created");
      console.log("resp of order:", response.data);

      // Send WhatsApp Notification to Customer
      await sendShipmentConfirmation(
        formatPhoneNumber(contactDetails?.phone),
        contactDetails?.firstName,
        orderId,
        waybill
      );

      const fullfillment = await createFulfillment(
        authToken,
        siteId,
        entityId,
        waybill,
        lineItems
      );
      // return response.data;
    }
    console.log("outside resp--", response.data);
    return response.data;
  } catch (error) {
    console.error(
      error.status,
      "Error:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

// Create fullfillment after order creation-----
async function createFulfillment(
  authToken,
  siteId,
  entityId,
  waybill,
  lineItems
) {
  try {
    // Map lineItems to extract id and quantity
    const mappedLineItems = lineItems.map((item) => ({
      id: item.id,
      quantity: item.quantity,
    }));

    // Constructing the fulfillment payload
    const payload = {
      fulfillment: {
        lineItems: mappedLineItems,
        trackingInfo: {
          trackingNumber: waybill,
          shippingProvider: "Delhivery",
          trackingLink: `https://www.delhivery.com/track/package/${waybill}`,
        },
      },
    };

    // Make the API request
    const response = await axios.post(
      `https://www.wixapis.com/ecom/v1/fulfillments/orders/${entityId}/create-fulfillment`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken,
          "wix-site-id": siteId,
        },
      }
    );

    console.log("Fulfillment response:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "Error creating fulfillment:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// send shipment confirmation-----
async function sendShipmentConfirmation(phoneNumber, name, orderId, waybill) {
  const webhookUrl =
    "https://adminapis.backendprod.com/lms_campaign/api/whatsapp/template/0vm1twx6z7/process";

  const payload = {
    receiver: phoneNumber,
    values: {
      1: name,
      2: orderId,
      3: waybill,
      4: `https://www.delhivery.com/track/package/${waybill}`,
    },
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("WhatsApp Notification Sent:", response.data);
  } catch (error) {
    console.error("Failed to send WhatsApp notification:", error.message);
  }
}

// shipment creation failed notification-----
async function sendShipmentFailureNotification(orderId, remarks, phoneNumber) {
  const warehouse = await prisma.warehouse.findUnique({
    where: {
      instanceId: "2d2091eb-e932-48cb-b964-875632831135",
    },
  });

  const webhookUrl =
    "https://adminapis.backendprod.com/lms_campaign/api/whatsapp/template/3k02zeo6ys/process";

  const payload = {
    receiver: warehouse.phone,
    values: {
      1: orderId,
      2: remarks,
      3: phoneNumber,
    },
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("WhatsApp Failure Notification Sent:", response.data);
  } catch (error) {
    console.error(
      "Failed to send WhatsApp failure notification:",
      error.message
    );
  }
}

// Non service notification------
async function sendNonServiceableNotification(orderId, pincode, phone) {
  const warehouse = await prisma.warehouse.findUnique({
    where: {
      instanceId: "2d2091eb-e932-48cb-b964-875632831135",
    },
  });

  const webhookUrl =
    "https://adminapis.backendprod.com/lms_campaign/api/whatsapp/template/t8kql6j02v/process";

  const payload = {
    receiver: warehouse.phone,
    values: {
      1: orderId,
      2: pincode,
      3: phone,
    },
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("Non-serviceable WhatsApp Notification Sent:", response.data);
  } catch (error) {
    console.error(
      "Failed to send non-serviceable WhatsApp notification:",
      error.message
    );
  }
}

// Send Shipment Confirmation-----
async function orderConfirmation(phoneNumber, name, orderId) {
  const webhookUrl =
    "https://adminapis.backendprod.com/lms_campaign/api/whatsapp/template/9rq6v51yxu/process";

  const payload = {
    receiver: phoneNumber,
    values: {
      1: name,
      2: orderId,
    },
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("WhatsApp Notification Sent:", response.data);
  } catch (error) {
    console.error("Failed to send WhatsApp notification:", error.message);
  }
}

// Webhooks from which we receive the payloads-----
app.post("/webhook", express.text(), async (request, response) => {
  let event;
  let eventData;

  try {
    const rawPayload = jwt.verify(request.body, PUBLIC_KEY, {
      algorithms: ["RS256"],
    });
    event = JSON.parse(rawPayload.data);
    eventData = JSON.parse(event.data);

    console.log("Instance ID---:", event.instanceId);
  } catch (err) {
    console.error(err);
    response.status(400).send(`Webhook error: ${err.message}`);
    return;
  }

  switch (event.eventType) {
    case "wix.ecom.v1.order_payment_status_updated":
      response.status(200).send();
      // console.log(
      //   "wix.ecom.v1.order_payment_status_updated event received with data:",
      //   eventData
      // );

      const entityId = eventData.entityId;
      const webhookData = eventData.actionEvent.body.order;
      const InstanceId = event.instanceId;
      const orderId = webhookData.number;
      const {
        billingInfo,
        lineItems,
        createdDate,
        priceSummary,
        paymentStatus,
        recipientInfo,
      } = webhookData;
      const { contactDetails, address } = recipientInfo;

      console.log("order");
      // Check if the order has already been processed
      const existingOrder = await prisma.customer_shipment.findUnique({
        where: { orderID: orderId },
      });

      if (existingOrder) {
        console.log(`Order - 2 ${orderId} has already been processed.`);
        return;
      }

      // emit the event to handle it as asynchrous------
      eventEmitter.emit(
        "processOrder",
        InstanceId,
        orderId,
        billingInfo,
        lineItems,
        createdDate,
        priceSummary,
        paymentStatus,
        recipientInfo,
        entityId
      );

      break;
    default:
      console.log(`Received unknown event type: ${event.eventType}`);
      break;
  }
});

// Event listener for processing the order------
eventEmitter.on(
  "processOrder",
  async (
    InstanceId,
    orderId,
    billingInfo,
    lineItems,
    createdDate,
    priceSummary,
    paymentStatus,
    recipientInfo,
    entityId
  ) => {
    try {
      const { contactDetails, address } = recipientInfo;

      console.log("state---", address);
      console.log("country---", address.country);

      const formatPhoneNumber = (phone) => {
        return phone ? phone.replace(/\D/g, "") : "";
      };

      const confirmResponse = await orderConfirmation(
        formatPhoneNumber(contactDetails?.phone),
        contactDetails.firstName,
        orderId
      );

      const serviceablePincodes = await getServiceablePincodes(
        address.postalCode
      );

      // non service pin-code-----
      if (
        !serviceablePincodes ||
        serviceablePincodes?.delivery_codes.length === 0
      ) {
        console.log(
          "Pincode not serviceable. Sending WhatsApp notification..."
        );

        const formatPhoneNumber = (phone) => {
          return phone ? phone.replace(/\D/g, "") : "";
        };

        await sendNonServiceableNotification(
          orderId,
          address.postalCode,
          formatPhoneNumber(contactDetails?.phone)
        );
        return;
      }

      // serviceable pin-code-----
      if (
        serviceablePincodes &&
        serviceablePincodes?.delivery_codes.length > 0
      ) {
        const responseOrder = await createShipment(
          InstanceId,
          orderId,
          billingInfo,
          lineItems,
          createdDate,
          priceSummary,
          paymentStatus,
          recipientInfo,
          entityId
        );
        // console.log("Response from createShipment:", responseOrder);
      }
    } catch (error) {
      console.error("Error processing order:", error);
    }
  }
);

const PORT = process.env.PORT || 5003;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
