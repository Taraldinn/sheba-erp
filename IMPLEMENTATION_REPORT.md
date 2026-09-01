# Implementation Report: SaaS Client Features

This report documents the design, database storage, validation, security, and verification details of the **SaaS Client Birthday Greeting**, **SaaS License Expiry Scrolling Alert**, and **POP Summary Cards** features.

---

## 1. Feature Summary: SaaS Client Birthday Greeting
The SaaS Client Birthday Greeting feature celebrates the birthday of the main tenant administrator (the ISP Owner / SaaS Customer) by displaying a modern, premium birthday modal once per login session on their birthday. The feature includes:
* Validation and input of Client Name and Date of Birth during new tenant installation.
* Capability for the administrator to update their Client Name and Date of Birth within the settings panel.
* Clean multi-tenant isolation where each tenant's data is isolated in their respective databases.
* A premium responsive modal containing confetti animation, balloon decorations, a birthday cake illustration, and soft shadows.
* A server-side session flag to ensure the popup is only displayed once per login session.

---

## 2. Feature Summary: SaaS License Expiry Scrolling Alert
When a SaaS Tenant's license is expiring in **5 days or less** (up to the expiry date), a prominent scrolling marquee notification text is displayed at the top of the admin panel:
* **Notice Text:** `"সম্মানিত গ্রাহক, আপনার ISP Billing System-এর বর্তমান সাবস্ক্রিপশনের মেয়াদ [EXPIRE DATE] তারিখে শেষ হবে। নিরবচ্ছিন্নভাবে সেবা ব্যবহার চালু রাখতে অনুগ্রহ করে মেয়াদ শেষ হওয়ার আগেই আপনার সাবস্ক্রিপশনটি নবায়ন করে নেওয়ার জন্য অনুরোধ করা হলো।"`
* **Styling:** Features a modern orange/red gradient warning banner with a pulsing "জরুরী নোটিশ" badge, structured to sit cleanly below the main admin navigation bar.
* **Exclusion:** Only rendered inside the administrative staff panels (`views/layout/header.php`); client/subscriber portals are excluded from viewing this message.

---

## 3. Feature Summary: POP Summary Cards
A new dashboard section **POP Summary** has been added to display client metrics across POP Managers, Branches, Resellers, Sub-Resellers, and Agents.
* **Visibility Rules:**
  1. Displays in the **Admin Panel** only if there is at least one active reseller/POP/branch/agent in the system.
  2. Displays in the **Reseller Panel** (as POP Summary) only if the logged-in Reseller has at least one Sub-Reseller or Agent under them.
  3. Stays completely **hidden** if no reseller/POP/branch/agent structure exists.
* **Included Cards:**
  * **Total POP Client:** Sum of all clients belonging to resellers.
  * **POP Active:** Active reseller clients (`status IN ('Active','Free','Promise Active')`).
  * **This Month Joined:** New reseller clients who joined this month.
  * **POP Inactive:** Inactive reseller clients (`status = 'Inactive'`).
  * **Expired Only:** Expired reseller clients (`status = 'Expire'`).
  * **POP Online:** Online reseller clients computed using real-time connection arrays.
  * **POP Offline:** Offline reseller clients.

---

## 4. Database Changes & Storage
* **Location:** Stored dynamically in the tenant's individual `settings` database table using the system's native key-value storage.
* **Option Keys:**
  * `client_name`: Stored as `TEXT` in the database. Represents the name of the ISP Owner / SaaS customer.
  * `client_date_of_birth`: Stored as `TEXT` (representing MySQL `DATE` format: `YYYY-MM-DD`).
* **Multi-Tenant Isolation:** Because the system connects to separate databases for each tenant based on subdomain detection (resolved via `includes/tenant.php` and loaded in `includes/config.php`), settings for Tenant A and Tenant B reside in completely separate databases. There is zero risk of data leakage.

---

## 5. Installer Changes
* **File Modified:** [install/index.php](file:///d:/Ashik/Sheba%209%20aug%2026/install/index.php)
  * Placed a new **Client Information** section containing inputs for **Client Name** and **Date of Birth** (`<input type="date">`) immediately after the "Admin Account Setup" section.
* **File Modified:** [install/install.php](file:///d:/Ashik/Sheba%209%20aug%2026/install/install.php)
  * Implemented validation:
    * Client Name cannot be empty.
    * Date of Birth must be present and match the format `YYYY-MM-DD`.
  * Saved the inputs during installation in the `settings` table of the tenant database.

---

## 6. Settings Update Capability
* **File Modified:** [views/settings/settings.php](file:///d:/Ashik/Sheba%209%20aug%2026/views/settings/settings.php)
  * Appended "Client Name" and "Date of Birth" settings input fields inside the **General Settings** panel.
* **File Modified:** [controllers/logic.php](file:///d:/Ashik/Sheba%209%20aug%2026/controllers/logic.php)
  * Handled saving `client_name` and `client_date_of_birth` inside the `update_settings` POST action handler.

---

## 7. Birthday Detection Logic
* **Timezone:** Uses the default system timezone (`Asia/Dhaka`), set globally in `includes/config.php`.
* **Comparison:** Excludes the birth year and compares only **Month** and **Day** matching `m-d`.
* **Leap-Year Handling:** Leap-year birthdays (e.g. `1992-02-29`) will only trigger on February 29 during leap years. In non-leap years, they will not trigger.
* **Checks:**
  1. User must be logged in.
  2. User must possess the `Admin` role.
  3. The current page view must be the dashboard.
  4. Both `client_name` and `client_date_of_birth` must be present and valid.

---

## 8. Session Behavior
* **Trigger:** Once per login session.
* **Session Key:** `$_SESSION['birthday_popup_shown'][tenant_key][current_year] = true`
* **Logout Reset:** Logouts trigger `session_destroy()`, wiping the session state, which allows the birthday popup to reappear upon next login.

---

## 9. Premium UI Details
* **Decorations:** 
  * Left and right colorful balloons with animated floating effects (`@keyframes`).
  * Inline high-quality SVG birthday cake illustration complete with candles, sprinkles, and frosting waves.
* **Confetti Animation:** Uses a lightweight HTML5 Canvas rendering engine with vanilla JavaScript inside the modal view. It automatically stops drawing after 5 seconds or when the modal is closed to optimize CPU utilization.

---

## 10. Summary of File Status

### Created Files
None.

### Modified Files
1. [install/index.php](file:///d:/Ashik/Sheba%209%20aug%2026/install/index.php) - Added installer form inputs.
2. [install/install.php](file:///d:/Ashik/Sheba%209%20aug%2026/install/install.php) - Added installer validations and settings saves.
3. [views/settings/settings.php](file:///d:/Ashik/Sheba%209%20aug%2026/views/settings/settings.php) - Added settings profile input fields.
4. [controllers/logic.php](file:///d:/Ashik/Sheba%209%20aug%2026/controllers/logic.php) - Handled settings save action parameters.
5. [views/layout/footer.php](file:///d:/Ashik/Sheba%209%20aug%2026/views/layout/footer.php) - Integrated birthday check modal, styles, canvas confetti, and scripts.
6. [views/layout/header.php](file:///d:/Ashik/Sheba%209%20aug%2026/views/layout/header.php) - Integrated the scrolling subscription expiry warning banner.
7. [controllers/view_data.php](file:///d:/Ashik/Sheba%209%20aug%2026/controllers/view_data.php) - Added reseller summary statistics queries.
8. [views/dashboard/dashboard.php](file:///d:/Ashik/Sheba%209%20aug%2026/views/dashboard/dashboard.php) - Embedded POP Summary card elements grid.
9. [views/dashboard.php](file:///d:/Ashik/Sheba%209%20aug%2026/views/dashboard.php) - Embedded POP Summary card elements grid.

---

## 11. Upgrade Path for Existing Tenants
Existing tenants do not need database schema updates. They can upgrade by:
1. Navigating to **Settings** -> **General Settings**.
2. Setting their **Client Name** and **Date of Birth**.
3. Clicking **Save Settings**.
