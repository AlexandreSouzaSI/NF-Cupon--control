-- CreateEnum
CREATE TYPE "TaskRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ONCE');

-- CreateEnum
CREATE TYPE "TaskOccurrenceStatus" AS ENUM ('PENDING', 'DONE', 'LATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_OVERDUE';

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recurrence" "TaskRecurrence" NOT NULL,
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,
    "dueDate" TIMESTAMP(3),
    "storeId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOccurrence" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "TaskOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "overdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_storeId_idx" ON "Task"("storeId");

-- CreateIndex
CREATE INDEX "Task_assignedToId_idx" ON "Task"("assignedToId");

-- CreateIndex
CREATE INDEX "TaskOccurrence_taskId_idx" ON "TaskOccurrence"("taskId");

-- CreateIndex
CREATE INDEX "TaskOccurrence_dueDate_idx" ON "TaskOccurrence"("dueDate");

-- CreateIndex
CREATE INDEX "TaskOccurrence_status_idx" ON "TaskOccurrence"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOccurrence_taskId_dueDate_key" ON "TaskOccurrence"("taskId", "dueDate");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
