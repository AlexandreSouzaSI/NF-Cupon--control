-- CreateEnum
CREATE TYPE "FreelancerPaymentGroup" AS ENUM ('SEXTA', 'SEGUNDA');

-- CreateTable
CREATE TABLE "FreelancerPayment" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "group" "FreelancerPaymentGroup" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "totalValue" DECIMAL(10,2) NOT NULL,
    "workDaysSnapshot" JSONB NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "FreelancerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreelancerPayment_storeId_idx" ON "FreelancerPayment"("storeId");

-- CreateIndex
CREATE INDEX "FreelancerPayment_freelancerId_idx" ON "FreelancerPayment"("freelancerId");

-- CreateIndex
CREATE INDEX "FreelancerPayment_paymentDate_idx" ON "FreelancerPayment"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "FreelancerPayment_freelancerId_group_paymentDate_key" ON "FreelancerPayment"("freelancerId", "group", "paymentDate");

-- AddForeignKey
ALTER TABLE "FreelancerPayment" ADD CONSTRAINT "FreelancerPayment_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "Freelancer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreelancerPayment" ADD CONSTRAINT "FreelancerPayment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreelancerPayment" ADD CONSTRAINT "FreelancerPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
