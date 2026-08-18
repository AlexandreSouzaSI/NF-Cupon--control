-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BUYER', 'STOCKIST', 'MANAGER', 'OWNER');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'WAITING_APPROVAL', 'APPROVED', 'REJECTED', 'WAITING_RECEIPT', 'RECEIVED_OK', 'RECEIVED_WITH_DIFFERENCE', 'WAITING_INVOICE', 'HAS_COUPON_ONLY', 'HAS_INVOICE', 'WAITING_PAYMENT_REGISTER', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PurchaseCategory" AS ENUM ('SUPPLIER_ORDER', 'AVULSA_CARD', 'ONLINE_MARKETPLACE');

-- CreateEnum
CREATE TYPE "PurchaseOrigin" AS ENUM ('NORMAL', 'WEBSITE', 'MERCADO_LIVRE', 'WHATSAPP', 'PHONE', 'STORE_COUNTER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CREDIT_CARD', 'CASH', 'PIX', 'COMPANY_ACCOUNT', 'BOLETO');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FiscalDocumentType" AS ENUM ('COUPON', 'INVOICE');

-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('LINKED', 'REPLACED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('OK', 'MISSING_ITEMS', 'EXTRA_ITEMS', 'PARTIAL');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('OPEN', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "PayableType" AS ENUM ('BOLETO', 'PIX', 'CARD', 'NO_BILL');

-- CreateEnum
CREATE TYPE "ExternalLaunchStatus" AS ENUM ('NOT_LAUNCHED', 'LAUNCHED');

-- CreateEnum
CREATE TYPE "PurchaseHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'APPROVED', 'REJECTED', 'COUPON_UPLOADED', 'INVOICE_UPLOADED', 'RECEIVED', 'CLOSED', 'BILL_CREATED', 'BILL_PAID', 'DELETION_REQUESTED');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('AUTO', 'MANAGER', 'OWNER');

-- CreateEnum
CREATE TYPE "PurchaseAlertType" AS ENUM ('HIGH_VALUE', 'MISSING_SUPPLIER', 'WAITING_INVOICE', 'REPEATED_SUPPLIER', 'SUSPICIOUS_DESCRIPTION', 'CARD_USAGE', 'MISSING_RECEIPT', 'BILL_OVERDUE');

-- CreateEnum
CREATE TYPE "PurchaseAlertLevel" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PURCHASE_CREATED', 'PURCHASE_APPROVED', 'PURCHASE_REJECTED', 'WAITING_APPROVAL', 'WAITING_INVOICE', 'WAITING_RECEIPT', 'BILL_DUE_TODAY', 'BILL_DUE_WEEK', 'BILL_OVERDUE', 'CRITICAL_ALERT', 'DELETION_REQUESTED');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeletionTargetType" AS ENUM ('STORE', 'PURCHASE', 'PURCHASE_ITEM', 'FISCAL_DOCUMENT', 'BILL', 'SUPPLIER', 'ATTACHMENT', 'CARD');

-- CreateEnum
CREATE TYPE "FinancialTransactionDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "FinancialTransactionStatus" AS ENUM ('PENDING_CLASSIFICATION', 'CLASSIFIED', 'IGNORED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'BUYER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "UserStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastDigits" TEXT,
    "holderName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'WAITING_RECEIPT',
    "category" "PurchaseCategory" NOT NULL DEFAULT 'SUPPLIER_ORDER',
    "origin" "PurchaseOrigin" NOT NULL DEFAULT 'NORMAL',
    "method" "PaymentMethod" NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "externalOrderCode" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "storeId" TEXT NOT NULL,
    "supplierId" TEXT,
    "cardId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "invoiceResponsibleId" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT,
    "unitPrice" DECIMAL(10,2),
    "total" DECIMAL(10,2),
    "receivedQuantity" DECIMAL(10,3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "status" "ReceiptStatus" NOT NULL,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "type" "FiscalDocumentType" NOT NULL,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'LINKED',
    "number" TEXT,
    "accessKey" TEXT,
    "fileUrl" TEXT,
    "issueDate" TIMESTAMP(3),
    "value" DECIMAL(10,2),
    "purchaseId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "linkedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "type" "PayableType" NOT NULL DEFAULT 'BOLETO',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" "BillStatus" NOT NULL DEFAULT 'OPEN',
    "externalLaunchStatus" "ExternalLaunchStatus" NOT NULL DEFAULT 'NOT_LAUNCHED',
    "externalSystemName" TEXT,
    "externalCode" TEXT,
    "hasBillFile" BOOLEAN NOT NULL DEFAULT false,
    "storeId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "supplierId" TEXT,
    "launchedById" TEXT NOT NULL,
    "fileUrl" TEXT,
    "imageUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "purchaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "purchaseId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseHistory" (
    "id" TEXT NOT NULL,
    "action" "PurchaseHistoryAction" NOT NULL,
    "comment" TEXT,
    "purchaseId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minValue" DECIMAL(10,2) NOT NULL,
    "maxValue" DECIMAL(10,2),
    "level" "ApprovalLevel" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseAlert" (
    "id" TEXT NOT NULL,
    "type" "PurchaseAlertType" NOT NULL,
    "level" "PurchaseAlertLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "purchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionRequest" (
    "id" TEXT NOT NULL,
    "targetType" "DeletionTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "ignoredRows" INTEGER NOT NULL DEFAULT 0,
    "storeId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "launch" TEXT NOT NULL,
    "companyName" TEXT,
    "document" TEXT,
    "description" TEXT,
    "value" DECIMAL(10,2) NOT NULL,
    "direction" "FinancialTransactionDirection" NOT NULL,
    "status" "FinancialTransactionStatus" NOT NULL DEFAULT 'PENDING_CLASSIFICATION',
    "storeId" TEXT,
    "truckId" TEXT,
    "categoryId" TEXT,
    "importId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialClassificationRule" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "categoryId" TEXT,
    "truckId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialClassificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserStore_userId_storeId_key" ON "UserStore"("userId", "storeId");

-- CreateIndex
CREATE INDEX "Purchase_storeId_idx" ON "Purchase"("storeId");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE INDEX "Purchase_category_idx" ON "Purchase"("category");

-- CreateIndex
CREATE INDEX "Purchase_origin_idx" ON "Purchase"("origin");

-- CreateIndex
CREATE INDEX "Purchase_method_idx" ON "Purchase"("method");

-- CreateIndex
CREATE INDEX "Purchase_purchasedAt_idx" ON "Purchase"("purchasedAt");

-- CreateIndex
CREATE INDEX "Purchase_dueDate_idx" ON "Purchase"("dueDate");

-- CreateIndex
CREATE INDEX "Purchase_approvedById_idx" ON "Purchase"("approvedById");

-- CreateIndex
CREATE INDEX "Purchase_invoiceResponsibleId_idx" ON "Purchase"("invoiceResponsibleId");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseId_idx" ON "PurchaseReceipt"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_receivedById_idx" ON "PurchaseReceipt"("receivedById");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_status_idx" ON "PurchaseReceipt"("status");

-- CreateIndex
CREATE INDEX "FiscalDocument_purchaseId_idx" ON "FiscalDocument"("purchaseId");

-- CreateIndex
CREATE INDEX "FiscalDocument_type_idx" ON "FiscalDocument"("type");

-- CreateIndex
CREATE INDEX "FiscalDocument_status_idx" ON "FiscalDocument"("status");

-- CreateIndex
CREATE INDEX "FiscalDocument_accessKey_idx" ON "FiscalDocument"("accessKey");

-- CreateIndex
CREATE INDEX "Bill_storeId_idx" ON "Bill"("storeId");

-- CreateIndex
CREATE INDEX "Bill_purchaseId_idx" ON "Bill"("purchaseId");

-- CreateIndex
CREATE INDEX "Bill_supplierId_idx" ON "Bill"("supplierId");

-- CreateIndex
CREATE INDEX "Bill_status_idx" ON "Bill"("status");

-- CreateIndex
CREATE INDEX "Bill_type_idx" ON "Bill"("type");

-- CreateIndex
CREATE INDEX "Bill_externalLaunchStatus_idx" ON "Bill"("externalLaunchStatus");

-- CreateIndex
CREATE INDEX "Bill_dueDate_idx" ON "Bill"("dueDate");

-- CreateIndex
CREATE INDEX "Attachment_purchaseId_idx" ON "Attachment"("purchaseId");

-- CreateIndex
CREATE INDEX "Approval_purchaseId_idx" ON "Approval"("purchaseId");

-- CreateIndex
CREATE INDEX "Approval_approverId_idx" ON "Approval"("approverId");

-- CreateIndex
CREATE INDEX "Approval_status_idx" ON "Approval"("status");

-- CreateIndex
CREATE INDEX "PurchaseHistory_purchaseId_idx" ON "PurchaseHistory"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseHistory_userId_idx" ON "PurchaseHistory"("userId");

-- CreateIndex
CREATE INDEX "PurchaseHistory_action_idx" ON "PurchaseHistory"("action");

-- CreateIndex
CREATE INDEX "ApprovalRule_storeId_idx" ON "ApprovalRule"("storeId");

-- CreateIndex
CREATE INDEX "ApprovalRule_active_idx" ON "ApprovalRule"("active");

-- CreateIndex
CREATE INDEX "PurchaseAlert_purchaseId_idx" ON "PurchaseAlert"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseAlert_type_idx" ON "PurchaseAlert"("type");

-- CreateIndex
CREATE INDEX "PurchaseAlert_level_idx" ON "PurchaseAlert"("level");

-- CreateIndex
CREATE INDEX "PurchaseAlert_resolved_idx" ON "PurchaseAlert"("resolved");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "DeletionRequest_targetType_idx" ON "DeletionRequest"("targetType");

-- CreateIndex
CREATE INDEX "DeletionRequest_targetId_idx" ON "DeletionRequest"("targetId");

-- CreateIndex
CREATE INDEX "DeletionRequest_status_idx" ON "DeletionRequest"("status");

-- CreateIndex
CREATE INDEX "DeletionRequest_requestedById_idx" ON "DeletionRequest"("requestedById");

-- CreateIndex
CREATE INDEX "DeletionRequest_reviewedById_idx" ON "DeletionRequest"("reviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_plate_key" ON "Truck"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_name_key" ON "FinancialCategory"("name");

-- CreateIndex
CREATE INDEX "BankStatementImport_storeId_idx" ON "BankStatementImport"("storeId");

-- CreateIndex
CREATE INDEX "BankStatementImport_createdById_idx" ON "BankStatementImport"("createdById");

-- CreateIndex
CREATE INDEX "FinancialTransaction_date_idx" ON "FinancialTransaction"("date");

-- CreateIndex
CREATE INDEX "FinancialTransaction_direction_idx" ON "FinancialTransaction"("direction");

-- CreateIndex
CREATE INDEX "FinancialTransaction_truckId_idx" ON "FinancialTransaction"("truckId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_categoryId_idx" ON "FinancialTransaction"("categoryId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_storeId_idx" ON "FinancialTransaction"("storeId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_status_idx" ON "FinancialTransaction"("status");

-- CreateIndex
CREATE INDEX "FinancialClassificationRule_keyword_idx" ON "FinancialClassificationRule"("keyword");

-- CreateIndex
CREATE INDEX "FinancialClassificationRule_active_idx" ON "FinancialClassificationRule"("active");

-- AddForeignKey
ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_invoiceResponsibleId_fkey" FOREIGN KEY ("invoiceResponsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_linkedToId_fkey" FOREIGN KEY ("linkedToId") REFERENCES "FiscalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_launchedById_fkey" FOREIGN KEY ("launchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseHistory" ADD CONSTRAINT "PurchaseHistory_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseHistory" ADD CONSTRAINT "PurchaseHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseAlert" ADD CONSTRAINT "PurchaseAlert_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletionRequest" ADD CONSTRAINT "DeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletionRequest" ADD CONSTRAINT "DeletionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankStatementImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialClassificationRule" ADD CONSTRAINT "FinancialClassificationRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialClassificationRule" ADD CONSTRAINT "FinancialClassificationRule_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
