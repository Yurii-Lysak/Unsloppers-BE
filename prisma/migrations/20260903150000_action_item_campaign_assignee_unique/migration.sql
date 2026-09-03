-- Story 4.4: one action item per (campaign, assignee); manual items keep campaignId NULL.
CREATE UNIQUE INDEX "action_items_campaignId_assigneeId_key" ON "action_items"("campaignId", "assigneeId");
