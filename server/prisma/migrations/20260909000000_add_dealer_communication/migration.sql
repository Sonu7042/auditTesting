CREATE TABLE "Dealer" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "companyName" TEXT, "email" TEXT,
  "phoneNumber" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "projectId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DealerConversation" (
  "id" TEXT NOT NULL, "subject" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN', "dueDate" TIMESTAMP(3), "projectId" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL, "auditId" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DealerConversation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DealerMessage" (
  "id" TEXT NOT NULL, "body" TEXT NOT NULL, "direction" TEXT NOT NULL DEFAULT 'OUTGOING',
  "senderName" TEXT, "isRead" BOOLEAN NOT NULL DEFAULT false, "conversationId" TEXT NOT NULL,
  "senderId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealerMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DealerMessageAttachment" (
  "id" TEXT NOT NULL, "messageId" TEXT NOT NULL, "fileUrl" TEXT NOT NULL, "publicId" TEXT,
  "fileName" TEXT NOT NULL, "fileType" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealerMessageAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Dealer_projectId_status_idx" ON "Dealer"("projectId", "status");
CREATE UNIQUE INDEX "Dealer_projectId_email_key" ON "Dealer"("projectId", "email");
CREATE INDEX "DealerConversation_projectId_status_idx" ON "DealerConversation"("projectId", "status");
CREATE INDEX "DealerConversation_dealerId_idx" ON "DealerConversation"("dealerId");
CREATE INDEX "DealerMessage_conversationId_createdAt_idx" ON "DealerMessage"("conversationId", "createdAt");
CREATE INDEX "DealerMessageAttachment_messageId_idx" ON "DealerMessageAttachment"("messageId");
ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealerConversation" ADD CONSTRAINT "DealerConversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealerConversation" ADD CONSTRAINT "DealerConversation_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealerConversation" ADD CONSTRAINT "DealerConversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealerMessage" ADD CONSTRAINT "DealerMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DealerConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealerMessage" ADD CONSTRAINT "DealerMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealerMessageAttachment" ADD CONSTRAINT "DealerMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DealerMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
