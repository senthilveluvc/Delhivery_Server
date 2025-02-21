/*
  Warnings:

  - The primary key for the `Warehouse` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `instanceId` to the `Warehouse` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Warehouse" DROP CONSTRAINT "Warehouse_pkey",
ADD COLUMN     "instanceId" TEXT NOT NULL,
ALTER COLUMN "warehouse_name" DROP NOT NULL,
ADD CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("instanceId");
