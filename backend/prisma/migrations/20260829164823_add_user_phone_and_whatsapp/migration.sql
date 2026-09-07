/*
  Warnings:

  - A unique constraint covering the columns `[phone]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "WhatsappMessageKind" AS ENUM ('TASK_ASSIGNED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "WhatsappOutboundMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" "WhatsappMessageKind" NOT NULL,
    "taskOccurrenceId" TEXT,
    "text" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "responseText" TEXT,
    "respondedAction" TEXT,

    CONSTRAINT "WhatsappOutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappOutboundMessage_userId_idx" ON "WhatsappOutboundMessage"("userId");

-- CreateIndex
CREATE INDEX "WhatsappOutboundMessage_phone_idx" ON "WhatsappOutboundMessage"("phone");

-- CreateIndex
CREATE INDEX "WhatsappOutboundMessage_taskOccurrenceId_idx" ON "WhatsappOutboundMessage"("taskOccurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- AddForeignKey
ALTER TABLE "WhatsappOutboundMessage" ADD CONSTRAINT "WhatsappOutboundMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappOutboundMessage" ADD CONSTRAINT "WhatsappOutboundMessage_taskOccurrenceId_fkey" FOREIGN KEY ("taskOccurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
