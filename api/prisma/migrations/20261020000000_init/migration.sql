-- CreateTable
CREATE TABLE "AbuseQuota" (
    "key" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,

    PRIMARY KEY ("key", "day")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reveal" BOOLEAN NOT NULL DEFAULT false,
    "autoReveal" BOOLEAN NOT NULL DEFAULT false,
    "useMultiplier" BOOLEAN NOT NULL DEFAULT false,
    "multiplierValue" REAL NOT NULL DEFAULT 1.0,
    "theme" TEXT NOT NULL DEFAULT 'default',
    "resultSnapshot" TEXT,
    "lobbyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "issuesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mood" TEXT NOT NULL DEFAULT 'playful',
    "statsStartedAt" DATETIME,
    "roundNumber" INTEGER NOT NULL DEFAULT 0,
    "roundStartedAt" DATETIME,
    "roundRevealedAt" DATETIME,
    "roundsRevealed" INTEGER NOT NULL DEFAULT 0,
    "unanimousRounds" INTEGER NOT NULL DEFAULT 0,
    "awardsStartedAt" DATETIME
);

-- CreateTable
CREATE TABLE "RoomApproval" (
    "statsId" TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    "votesCast" INTEGER NOT NULL DEFAULT 0,
    "lastVotedRound" INTEGER NOT NULL DEFAULT -1,
    "throwsSent" INTEGER NOT NULL DEFAULT 0,
    "throwsReceived" INTEGER NOT NULL DEFAULT 0,
    "barragesSent" INTEGER NOT NULL DEFAULT 0,
    "currentVoteStreak" INTEGER NOT NULL DEFAULT 0,
    "bestVoteStreak" INTEGER NOT NULL DEFAULT 0,
    "characterVariety" INTEGER NOT NULL DEFAULT 0,
    "charactersUsed" TEXT NOT NULL DEFAULT '[]',
    "lastKnownName" TEXT,
    "lastIsObserver" BOOLEAN,
    "lastJoinedAt" DATETIME,
    "roomId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,

    PRIMARY KEY ("roomId", "visitorId"),
    CONSTRAINT "RoomApproval_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "vote" TEXT,
    "isObserver" BOOLEAN NOT NULL DEFAULT false,
    "visitorId" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agreementVersion" TEXT,
    "agreementText" TEXT,
    "agreementAcceptedAt" DATETIME,
    CONSTRAINT "User_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisitorAgreement" (
    "visitorId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "acceptedAt" DATETIME NOT NULL,

    PRIMARY KEY ("visitorId", "version")
);

-- CreateTable
CREATE TABLE "ObserverPreference" (
    "roomId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "isObserver" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("roomId", "visitorId"),
    CONSTRAINT "ObserverPreference_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "parentId" TEXT,
    "rootId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issueNumber" TEXT,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "estimate" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstVoteMin" REAL,
    "firstVoteMax" REAL,
    "latestVoteMin" REAL,
    "latestVoteMax" REAL,
    "firstVoteSpread" REAL NOT NULL DEFAULT 0,
    "spreadReduction" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Issue_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Issue_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedbackAccess" (
    "visitorId" TEXT NOT NULL PRIMARY KEY,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agreementVersion" TEXT,
    "agreementText" TEXT,
    "agreementAcceptedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitorId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'published',
    "rejectionReason" TEXT,
    "workflowStatus" TEXT NOT NULL DEFAULT 'new',
    "resolutionReason" TEXT,
    "resolutionNote" TEXT,
    "duplicateOfId" TEXT,
    "authorStatusUnread" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Feedback_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Feedback" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedbackReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feedbackId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "authorReadAt" DATETIME,
    "adminReadAt" DATETIME,
    CONSTRAINT "FeedbackReply_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedbackVote" (
    "feedbackId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "reaction" TEXT NOT NULL,

    PRIMARY KEY ("feedbackId", "visitorId"),
    CONSTRAINT "FeedbackVote_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RateLimitDaily" (
    "visitorId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastHitAt" DATETIME NOT NULL,

    PRIMARY KEY ("visitorId", "day")
);

-- CreateTable
CREATE TABLE "UsageDaily" (
    "day" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "metric")
);

-- CreateIndex
CREATE INDEX "AbuseQuota_expiresAt_idx" ON "AbuseQuota"("expiresAt");

-- CreateIndex
CREATE INDEX "RoomApproval_visitorId_idx" ON "RoomApproval"("visitorId");

-- CreateIndex
CREATE INDEX "User_visitorId_idx" ON "User"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "User_roomId_visitorId_key" ON "User"("roomId", "visitorId");

-- CreateIndex
CREATE INDEX "VisitorAgreement_acceptedAt_idx" ON "VisitorAgreement"("acceptedAt");

-- CreateIndex
CREATE INDEX "Issue_roomId_parentId_createdAt_id_idx" ON "Issue"("roomId", "parentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Issue_roomId_rootId_idx" ON "Issue"("roomId", "rootId");

-- CreateIndex
CREATE INDEX "Issue_parentId_idx" ON "Issue"("parentId");

-- CreateIndex
CREATE INDEX "FeedbackAccess_approvedAt_idx" ON "FeedbackAccess"("approvedAt");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_id_idx" ON "Feedback"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Feedback_category_createdAt_id_idx" ON "Feedback"("category", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Feedback_visitorId_createdAt_idx" ON "Feedback"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_visitorId_authorStatusUnread_idx" ON "Feedback"("visitorId", "authorStatusUnread");

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_id_idx" ON "Feedback"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Feedback_duplicateOfId_idx" ON "Feedback"("duplicateOfId");

-- CreateIndex
CREATE INDEX "FeedbackReply_feedbackId_createdAt_id_idx" ON "FeedbackReply"("feedbackId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "FeedbackReply_status_createdAt_id_idx" ON "FeedbackReply"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "FeedbackReply_feedbackId_author_status_authorReadAt_adminReadAt_idx" ON "FeedbackReply"("feedbackId", "author", "status", "authorReadAt", "adminReadAt");

-- CreateIndex
CREATE INDEX "RateLimitDaily_day_idx" ON "RateLimitDaily"("day");

