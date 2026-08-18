-- CreateTable
CREATE TABLE "Freelancer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultDailyValue" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "storeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Freelancer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreelancerWorkDay" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreelancerWorkDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Freelancer_storeId_idx" ON "Freelancer"("storeId");

-- CreateIndex
CREATE INDEX "Freelancer_name_idx" ON "Freelancer"("name");

-- CreateIndex
CREATE INDEX "FreelancerWorkDay_freelancerId_idx" ON "FreelancerWorkDay"("freelancerId");

-- CreateIndex
CREATE INDEX "FreelancerWorkDay_date_idx" ON "FreelancerWorkDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "FreelancerWorkDay_freelancerId_date_key" ON "FreelancerWorkDay"("freelancerId", "date");

-- AddForeignKey
ALTER TABLE "Freelancer" ADD CONSTRAINT "Freelancer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Freelancer" ADD CONSTRAINT "Freelancer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreelancerWorkDay" ADD CONSTRAINT "FreelancerWorkDay_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "Freelancer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
