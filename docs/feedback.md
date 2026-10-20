# Feedback

The global feedback feed is available to any visitor whose signed browser identity
has been approved in at least one room. The feedback API checks that identity on
every request; the Angular route guard and room-header icon are navigation aids.
Creators count as approved visitors; this is anonymous eligibility rather than
independent verification of a person. Room approval also writes a durable
`FeedbackAccess` row. Deleting an inactive room does not immediately remove that
row; daily cleanup removes access older than `limits.inactiveRoomDays` only when no user, room
approval, or authored feedback remains linked to the visitor. A visitor who
clears their browser cookie loses that identity and must be approved again.

Submitting feedback requires explicit acceptance of the current site use agreement.
The API validates the agreement version and assent, then stores the version, exact
text, and acceptance time on the durable `FeedbackAccess` visitor record in the
same transaction as the new feedback item.

The built-in agreement and privacy notice are built in `shared/src/legal/`
from the site settings (`config/site.json`); an operator can replace either with
a text file (`legal.termsFile`, `legal.privacyFile`). The API serves the result
from `GET /api/site-config` and derives the agreement version from a hash of the
agreement text, so any change to the text or the settings it mentions asks
visitors to accept again. Each acceptance stores that exact text. With
`legal.requireAgreement` off, nothing is asked for or stored, and new browser
IDs are charged the new-visitor budgets when they first join a room.

The same agreement is shown during onboarding before room creation or joining.
Creating a room user requires the current agreement; its version, exact text, and
acceptance time are stored on the `User` row. Reconnecting to an existing user
does not create another acceptance record. A `VisitorAgreement` row retains the
first acceptance for each visitor and agreement version after room cleanup,
subject to the same old-orphan retention policy. Creation and new agreements
consume durable daily budgets; see [abuse limits](operations.md#application-abuse-limits).

Feedback is stored separately from rooms and displayed as plain text. The API
rejects links and markup, enforces length and submission limits, and returns
newest-first pages without exposing author visitor IDs. Browsing filters by
feedback type, and each response includes total counts for every type so tab
badges remain accurate across pages. Deployments must apply Prisma migrations
before starting the updated API.

Category feeds default to newest-first order and also support Top order. Top
uses agree minus disagree for general feedback, confirmations for bugs, "I'd use
this" minus "Not for me" for feature requests, and "I'd throw this" minus "Not
for me" for character requests. Ties use creation time and ID, newest first.
The API applies the sort before pagination; changing vote totals can reorder a
live feed between page requests.

Each feedback item accepts one active reaction per approved visitor. General
feedback offers agree/disagree, bugs offer "I've seen this too", feature requests
offer "I'd use this"/"Not for me", and character requests offer "I'd throw this"/
"Not for me". Visitors may change or remove their reaction but cannot vote on
their own feedback. The API validates the reaction against the item category,
and the database enforces one vote per visitor and item. Feed responses include
reaction counts and the current visitor's vote without exposing voter IDs.

New feedback items and author replies are saved as `pending` and stay private
until the operator approves or rejects them on the admin page; there is
no automated review. A rejection may carry a short reason for the author. Only
published rows appear in the public feed, category counts, sort queries, and
vote endpoints; other visitors cannot use private items as cursors or vote
targets. Admin replies are published immediately. `/api/feedback/mine` returns
an approved visitor's own submissions, including pending and rejected items.
When the admin approves or rejects an item, changes its workflow (status,
closure reason, note, or duplicate link), or posts a published reply,
`/api/feedback/mine/updates` reports news and the room's feedback button shows
a quiet dot. Opening My submissions tags those items "Updated" and clears
status news through `POST /api/feedback/mine/seen`; replies clear through their
read receipts. Voting has aggregate network and global budgets; database
uniqueness enforces one vote per browser identity and item, not one vote per
person.
