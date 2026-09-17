-- AlterEnum
ALTER TYPE "TaskOccurrenceStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "WhatsappMessageKind" ADD VALUE 'TASK_OVERDUE';

-- AlterTable
ALTER TABLE "TaskOccurrence" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
