-- CreateTable
CREATE TABLE "Warehouse" (
    "warehouse_name" TEXT NOT NULL,
    "uuid" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "pincode" TEXT,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("warehouse_name")
);

-- CreateTable
CREATE TABLE "Customer_shipment" (
    "orderID" TEXT NOT NULL,
    "uuid" UUID NOT NULL,
    "customer_name" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "pincode" TEXT,
    "payment_mode" TEXT NOT NULL DEFAULT 'Prepaid',
    "shipment_mode" TEXT,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "product_desc" TEXT,
    "business_name" TEXT,
    "waybill" TEXT,
    "status" TEXT,
    "order_json" JSONB,

    CONSTRAINT "Customer_shipment_pkey" PRIMARY KEY ("orderID")
);

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_uuid_key" ON "Warehouse"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_shipment_uuid_key" ON "Customer_shipment"("uuid");
