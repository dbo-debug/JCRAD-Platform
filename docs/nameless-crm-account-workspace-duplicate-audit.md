# Nameless CRM account workspace duplicate-action audit

| Current label | Component before consolidation | Action performed | Duplicate or unique | Canonical replacement | Disposition |
| --- | --- | --- | --- | --- | --- |
| Call / Call buyer | Page header, manager quick actions, contact rows, task cards | Opens the relevant `tel:` link | Duplicate at account level; unique per contact | `Call buyer` in the single account quick-action bar; contact-row calls stay contextual | Consolidated |
| Email / Email account | Manager quick actions, contact rows, task cards, Account Email | Opens account Gmail composer or a contact `mailto:` | Duplicate at account level; unique per contact | `Email account` in the quick-action bar opens Account Email; contact-row email stays contextual | Consolidated |
| Log Activity | Legacy manager generic form | Posts a basic customer activity | Duplicate | Retail activity composer using the existing retail sales endpoint | Removed |
| Log activity or meeting | RetailSalesPanel | Posts typed activity with contact, opportunity, outcome, next action, date, and optional task | Canonical | `RetailSalesActivityComposer` | Moved into Activity & Follow-Up |
| Recent Timeline / Recent Activity | Standalone page panel | Displays existing customer activity | Duplicate presentation | Recent Timeline inside Activity & Follow-Up | Moved |
| Create Follow-Up / New Task | Manager quick action and task form | Creates an explicitly assigned customer task | Canonical manual-task path | Manager follow-up task composer | Consolidated into Activity & Follow-Up |
| Create a follow-up task | Retail activity toggle | Creates a task as part of logging an activity | Unique transactional option | Activity composer toggle | Retained beside the canonical activity composer |
| Add Note | Manager note form | Posts to the established customer notes API | Unique record type | Add Internal Note in Activity & Follow-Up | Moved |
| Internal Note | Retail activity type | Logs an internal-note activity event | Unique activity type | Activity composer | Retained; not treated as the same record as customer notes |
| Create Opportunity | RetailSalesPanel | Posts a retail opportunity | Canonical | Collapsed Create Opportunity panel in Sales Pipeline | Consolidated and collapsed |
| Opportunities | RetailSalesPanel | Lists and advances retail opportunities | Canonical | Current Opportunities in Sales Pipeline | Retained |
| Record Sample | RetailSalesPanel | Posts sample request/drop data | Canonical | Collapsed Record Samples panel | Consolidated and collapsed |
| Sample list | Missing from the visible legacy composition | Displays existing retail sample records | Unique | Sample History beside the collapsed form | Added to canonical section |
| Record Order & Commission | RetailSalesPanel | Posts retail order and commission estimate data | Canonical | Collapsed order form in Samples, Orders & Commission | Consolidated and collapsed |
| Orders and commission | RetailSalesPanel | Displays retail operational orders/commission | Canonical daily workflow | Orders & Commission list | Retained |
| Orders | Page-level legacy records panel | Displays historically linked orders | Unique legacy dataset | Related Commercial Records | Moved and collapsed |
| Estimates / Packaging Submissions | Page-level panels | Displays historically linked commercial records | Unique legacy datasets | Related Commercial Records | Moved and collapsed |
| Add to Route / Route Prep | Manager quick actions and route workspace | Adds account to route queue or edits route state | Contextual duplicate | One quick Add to Route plus canonical Route & Field Operations controls | Consolidated |
| Open Maps | Manager quick actions and route workspace | Opens mapped account address | Contextual duplicate | One quick Open Maps plus route-local map control | Consolidated |
| Route readiness | Snapshot badges, manager summary, route workspace | Communicates territory/coordinate readiness | Duplicate | One Account Attention signal; detailed state inside Route & Field Operations | Consolidated |
| Contact management | Always-expanded manager section | Edits primary and additional contacts | Unique | Collapsed Contacts panel in Account Setup | Moved and collapsed |
| Account Setup | Always-expanded manager section | Updates identity, lifecycle, ownership, assignment, and address | Unique | Collapsed Account Setup panel | Moved and collapsed |
| Retail account profile | RetailSalesPanel | Updates license, DBA/legal name, brands, distributor, and source | Unique | Retail setup panel under Account Setup | Moved and collapsed |
| Ownership and commission protection | RetailSalesPanel | Updates ownership verification and commission eligibility/rate | Unique | Retail setup panel under Account Setup | Moved and collapsed |
| Documents / Internal Notes history | Standalone page panels | Displays supporting account records | Unique | Related Commercial Records & Notes | Moved and collapsed |
| Erase Account | Manager danger zone | Deletes the account after confirmation | Unique destructive action | Isolated danger zone at page bottom | Retained and isolated |
