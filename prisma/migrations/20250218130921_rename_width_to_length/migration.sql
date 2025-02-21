/*
  Warnings:

  - You are about to drop the column `width` on the `Customer_shipment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Customer_shipment" DROP COLUMN "width",
ADD COLUMN     "length" DOUBLE PRECISION;
