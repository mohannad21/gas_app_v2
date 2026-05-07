# TICKET: Arabic RTL i18n — two-language support (English + Arabic)

## Branch
Stay on the current branch.

## Background

The app needs to support Arabic as a second language alongside English. When Arabic is
selected the app layout flips to RTL. All UI chrome strings are translated; dynamic
data (customer names, company names, amounts, dates) is never translated.

Confirmed scope:
- Language switcher in **Settings (Account)** screen and as the **first step of the
  onboarding wizard**.
- Frontend only (no backend changes).
- Western digits (0-9) — no Eastern Arabic numerals.
- Arabic translations provided in this ticket; user will correct inaccuracies.
- System fonts — define font configuration in one place (no per-screen changes in
  this ticket; existing `NunitoSans` fontFamily calls fall back gracefully for Arabic
  glyphs on both iOS and Android).
- All screens covered in one ticket.
- Single TypeScript translations file with English + Arabic strings side by side.

---

## Files changed

| File | Action |
|------|--------|
| `frontend/lib/i18n/translations.ts` | **Create** — all string pairs |
| `frontend/lib/i18n/LanguageContext.tsx` | **Create** — context, provider, `useLanguage` hook |
| `frontend/lib/i18n/fontConfig.ts` | **Create** — global font family constants |
| `frontend/lib/i18n/index.ts` | **Create** — re-exports |
| `frontend/app/_layout.tsx` | **Modify** — wrap with `LanguageProvider`; init RTL on startup |
| `frontend/app/(tabs)/_layout.tsx` | **Modify** — translate tab titles |
| `frontend/app/welcome/index.tsx` | **Modify** — add language step as step 0; translate all wizard strings |
| `frontend/app/(tabs)/account/index.tsx` | **Modify** — add Language menu item; translate all strings |
| `frontend/app/login.tsx` | **Modify** — translate all strings |
| `frontend/app/(tabs)/account/change-password.tsx` | **Modify** — translate all strings |
| `frontend/app/(tabs)/account/business-profile.tsx` | **Modify** — translate all strings |
| `frontend/app/(tabs)/account/workers.tsx` | **Modify** — translate all strings |
| `frontend/app/(tabs)/reports/index.tsx` | **Modify** — translate UI chrome strings |
| `frontend/app/(tabs)/customers-home/index.tsx` | **Modify** — translate UI chrome strings |
| `frontend/app/(tabs)/add/index.tsx` | **Modify** — translate UI chrome strings |

> **Do NOT translate** dynamic data: customer names, company names, dates, amounts,
> phone numbers, activation codes, or any value that comes from the backend.

---

## Step 1 — Create `frontend/lib/i18n/translations.ts`

Create this file with the complete translation table. Each key maps to `{ en, ar }`.

```typescript
// frontend/lib/i18n/translations.ts
// All UI string pairs. Key = dot-separated path. Value = { en, ar }.
// Dynamic data (names, amounts, dates) is NOT in this file.

export const T: Record<string, { en: string; ar: string }> = {
  // ── Common buttons ──────────────────────────────────────────────────────
  "common.save":            { en: "Save",           ar: "حفظ" },
  "common.cancel":          { en: "Cancel",         ar: "إلغاء" },
  "common.back":            { en: "Back",           ar: "رجوع" },
  "common.next":            { en: "Next",           ar: "التالي" },
  "common.done":            { en: "Done",           ar: "تم" },
  "common.delete":          { en: "Delete",         ar: "حذف" },
  "common.edit":            { en: "Edit",           ar: "تعديل" },
  "common.confirm":         { en: "Confirm",        ar: "تأكيد" },
  "common.close":           { en: "Close",          ar: "إغلاق" },
  "common.add":             { en: "Add",            ar: "إضافة" },
  "common.remove":          { en: "Remove",         ar: "إزالة" },
  "common.yes":             { en: "Yes",            ar: "نعم" },
  "common.no":              { en: "No",             ar: "لا" },
  "common.ok":              { en: "OK",             ar: "حسناً" },
  "common.retry":           { en: "Retry",          ar: "إعادة المحاولة" },
  "common.loading":         { en: "Loading...",     ar: "جارٍ التحميل..." },
  "common.error":           { en: "Error",          ar: "خطأ" },
  "common.success":         { en: "Success",        ar: "نجاح" },
  "common.noChange":        { en: "No change",      ar: "لا تغيير" },

  // ── Tab bar ──────────────────────────────────────────────────────────────
  "tabs.dashboard":  { en: "Dashboard", ar: "لوحة التحكم" },
  "tabs.customers":  { en: "Customers", ar: "العملاء" },
  "tabs.new":        { en: "New",       ar: "جديد" },
  "tabs.daily":      { en: "Daily",     ar: "يومي" },
  "tabs.account":    { en: "Account",   ar: "الحساب" },

  // ── Language selection ───────────────────────────────────────────────────
  "language.title":              { en: "Language",       ar: "اللغة" },
  "language.chooseTitle":        { en: "Choose Language", ar: "اختر اللغة" },
  "language.chooseSubtitle":     { en: "You can change this later from Settings.", ar: "يمكنك تغيير هذا لاحقاً من الإعدادات." },
  "language.english":            { en: "English",        ar: "English" },
  "language.arabic":             { en: "Arabic",         ar: "العربية" },
  "language.restartTitle":       { en: "Restart Required", ar: "إعادة التشغيل مطلوبة" },
  "language.restartMessage":     { en: "The app will restart to apply the language change.", ar: "سيتم إعادة تشغيل التطبيق لتطبيق تغيير اللغة." },

  // ── Login ────────────────────────────────────────────────────────────────
  "login.title":             { en: "Welcome Back",                                        ar: "مرحباً بعودتك" },
  "login.subtitle":          { en: "Sign in to continue",                                 ar: "سجّل الدخول للمتابعة" },
  "login.phonePlaceholder":  { en: "Phone number",                                        ar: "رقم الهاتف" },
  "login.passwordPlaceholder":{ en: "Password",                                           ar: "كلمة المرور" },
  "login.signIn":            { en: "Sign In",                                             ar: "تسجيل الدخول" },
  "login.errorRequired":     { en: "Phone and password are required",                     ar: "رقم الهاتف وكلمة المرور مطلوبان" },
  "login.errorCredentials":  { en: "Incorrect phone number or password",                  ar: "رقم الهاتف أو كلمة المرور غير صحيحة" },
  "login.errorInactive":     { en: "Account not yet activated. Use your activation code first.", ar: "الحساب غير مفعّل بعد. استخدم رمز التفعيل أولاً." },
  "login.errorConnect":      { en: "Could not connect. Please try again.",                ar: "تعذّر الاتصال. حاول مجدداً." },

  // ── Account / Settings ───────────────────────────────────────────────────
  "account.title":                  { en: "Account",             ar: "الحساب" },
  "account.sectionBusiness":        { en: "Business",            ar: "النشاط التجاري" },
  "account.sectionSubscription":    { en: "Subscription",        ar: "الاشتراك" },
  "account.sectionTeam":            { en: "Team",                ar: "الفريق" },
  "account.sectionConfiguration":   { en: "Configuration",       ar: "الإعدادات" },
  "account.sectionSecurity":        { en: "Security",            ar: "الأمان" },
  "account.sectionAppearance":      { en: "Appearance",          ar: "المظهر" },
  "account.menuBusinessProfile":    { en: "Business Profile",    ar: "الملف التجاري" },
  "account.menuPlanBilling":        { en: "Plan & Billing",      ar: "الخطة والفوترة" },
  "account.menuWorkers":            { en: "Workers",             ar: "الموظفون" },
  "account.menuPrices":             { en: "Prices",              ar: "الأسعار" },
  "account.menuSystemTypes":        { en: "System Types",        ar: "أنواع الأنظمة" },
  "account.menuExpenseCategories":  { en: "Expense Categories",  ar: "فئات المصروفات" },
  "account.menuCurrency":           { en: "Currency",            ar: "العملة" },
  "account.menuChangePassword":     { en: "Change Password",     ar: "تغيير كلمة المرور" },
  "account.menuLanguage":           { en: "Language",            ar: "اللغة" },
  "account.signOut":                { en: "Sign Out",            ar: "تسجيل الخروج" },
  "account.signOutTitle":           { en: "Sign Out",            ar: "تسجيل الخروج" },
  "account.signOutMessage":         { en: "Are you sure you want to sign out?", ar: "هل أنت متأكد أنك تريد تسجيل الخروج؟" },

  // ── Change Password ──────────────────────────────────────────────────────
  "changePassword.title":          { en: "Change Password",                              ar: "تغيير كلمة المرور" },
  "changePassword.current":        { en: "Current password",                             ar: "كلمة المرور الحالية" },
  "changePassword.new":            { en: "New password",                                 ar: "كلمة المرور الجديدة" },
  "changePassword.confirm":        { en: "Confirm new password",                         ar: "تأكيد كلمة المرور الجديدة" },
  "changePassword.updateButton":   { en: "Update Password",                              ar: "تحديث كلمة المرور" },
  "changePassword.errorRequired":  { en: "All fields are required",                      ar: "جميع الحقول مطلوبة" },
  "changePassword.errorMismatch":  { en: "New passwords do not match",                   ar: "كلمتا المرور الجديدتان غير متطابقتين" },
  "changePassword.errorTooShort":  { en: "New password must be at least 8 characters",   ar: "يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل" },
  "changePassword.errorIncorrect": { en: "Current password is incorrect",                ar: "كلمة المرور الحالية غير صحيحة" },
  "changePassword.errorFailed":    { en: "Failed to change password. Please try again.", ar: "فشل تغيير كلمة المرور. حاول مجدداً." },
  "changePassword.successToast":   { en: "Password changed successfully",                ar: "تم تغيير كلمة المرور بنجاح" },

  // ── Business Profile ─────────────────────────────────────────────────────
  "businessProfile.title":        { en: "Business Profile",        ar: "الملف التجاري" },
  "businessProfile.businessName": { en: "Business name",           ar: "اسم النشاط التجاري" },
  "businessProfile.ownerName":    { en: "Owner name",              ar: "اسم المالك" },
  "businessProfile.phone":        { en: "Phone",                   ar: "الهاتف" },
  "businessProfile.address":      { en: "Address",                 ar: "العنوان" },
  "businessProfile.savedTitle":   { en: "Saved",                   ar: "تم الحفظ" },
  "businessProfile.savedMessage": { en: "Profile updated.",        ar: "تم تحديث الملف." },
  "businessProfile.errorTitle":   { en: "Error",                   ar: "خطأ" },
  "businessProfile.errorMessage": { en: "Could not save profile.", ar: "تعذّر حفظ الملف." },

  // ── Workers ──────────────────────────────────────────────────────────────
  "workers.roleDriver":           { en: "Driver",                                               ar: "سائق" },
  "workers.roleCashier":          { en: "Cashier",                                              ar: "أمين الصندوق" },
  "workers.roleAccountant":       { en: "Accountant",                                           ar: "محاسب" },
  "workers.phonePlaceholder":     { en: "Phone number",                                         ar: "رقم الهاتف" },
  "workers.errorPhone":           { en: "Phone number is required.",                            ar: "رقم الهاتف مطلوب." },
  "workers.errorRole":            { en: "Select a role.",                                       ar: "اختر دوراً." },
  "workers.inviteCreatedTitle":   { en: "Invite created",                                       ar: "تمّ إنشاء الدعوة" },
  "workers.inviteSentTitle":      { en: "Invite sent",                                          ar: "تمّ إرسال الدعوة" },
  "workers.inviteSentMessage":    { en: "The activation code was sent to the worker.",          ar: "تم إرسال رمز التفعيل للموظف." },
  "workers.removeTitle":          { en: "Remove worker?",                                       ar: "إزالة الموظف؟" },
  "workers.cancelInviteTitle":    { en: "Cancel invite?",                                       ar: "إلغاء الدعوة؟" },

  // ── Onboarding wizard ────────────────────────────────────────────────────
  "onboarding.step.prices.title":       { en: "Prices",         ar: "الأسعار" },
  "onboarding.step.prices.question":    { en: "What do you charge for a 12kg and 48kg cylinder?", ar: "كم تتقاضى مقابل أسطوانة 12 كجم و48 كجم؟" },
  "onboarding.step.prices.explanation": { en: "You can change these later from Settings.", ar: "يمكنك تغيير هذه الأسعار لاحقاً من الإعدادات." },

  "onboarding.step.company.title":       { en: "Company",       ar: "الشركة" },
  "onboarding.step.company.question":    { en: "What is your current money balance with the company?", ar: "ما رصيدك المالي الحالي مع الشركة؟" },
  "onboarding.step.company.explanation": { en: "Record whether you owe the company money or the company owes you money.", ar: "سجّل ما إذا كنت مديناً للشركة أم أن الشركة مدينة لك." },

  "onboarding.step.companyCylinders.title":       { en: "Company Cylinders", ar: "أسطوانات الشركة" },
  "onboarding.step.companyCylinders.question":    { en: "What is your current cylinder balance with the company?", ar: "ما رصيدك الحالي من الأسطوانات مع الشركة؟" },
  "onboarding.step.companyCylinders.explanation": { en: "Record the current credit or debt position for each gas type. You can adjust it later if needed.", ar: "سجّل وضعية الرصيد أو الدين لكل نوع غاز. يمكنك التعديل لاحقاً إذا لزم." },

  "onboarding.step.inventoryFull.title":       { en: "Inventory", ar: "المخزون" },
  "onboarding.step.inventoryFull.question":    { en: "How many full tanks do you have in total?", ar: "كم عدد الأسطوانات الممتلئة لديك في المجموع؟" },
  "onboarding.step.inventoryFull.explanation": { en: "Everything combined: what is on the truck and what is in storage.", ar: "الإجمالي شامل ما في الشاحنة وما في المخزن." },

  "onboarding.step.inventoryEmpty.title":       { en: "Inventory", ar: "المخزون" },
  "onboarding.step.inventoryEmpty.question":    { en: "How many empty tanks do you have in total?", ar: "كم عدد الأسطوانات الفارغة لديك في المجموع؟" },
  "onboarding.step.inventoryEmpty.explanation": { en: "All spare empties that are not currently at a customer's house.", ar: "جميع الفوارغ الاحتياطية غير الموجودة لدى العملاء." },

  "onboarding.step.wallet.title":       { en: "Wallet",  ar: "المحفظة" },
  "onboarding.step.wallet.question":    { en: "How much money is in your wallet to start the day?", ar: "كم مبلغ المال في محفظتك لبدء اليوم؟" },
  "onboarding.step.wallet.explanation": { en: "This is your wallet balance right now.", ar: "هذا هو رصيد محفظتك الآن." },

  "onboarding.step.review.title":       { en: "Review",  ar: "المراجعة" },
  "onboarding.step.review.question":    { en: "Review your opening balances", ar: "راجع أرصدتك الافتتاحية" },
  "onboarding.step.review.explanation": { en: "Confirm these values to start using the app.", ar: "أكّد هذه القيم لبدء استخدام التطبيق." },

  "onboarding.confirmStart":       { en: "Confirm & Start Business", ar: "تأكيد وبدء النشاط التجاري" },
  "onboarding.starting":           { en: "Starting...",              ar: "جارٍ البدء..." },
  "onboarding.noOpeningBalances":  { en: "No opening balances provided.", ar: "لم يتم تقديم أرصدة افتتاحية." },

  "onboarding.field.sell12":         { en: "12kg selling price",    ar: "سعر بيع 12 كجم" },
  "onboarding.field.sell48":         { en: "48kg selling price",    ar: "سعر بيع 48 كجم" },
  "onboarding.field.buy12":          { en: "12kg buying price",     ar: "سعر شراء 12 كجم" },
  "onboarding.field.buy48":          { en: "48kg buying price",     ar: "سعر شراء 48 كجم" },
  "onboarding.field.sellIron12":     { en: "12kg iron sell price",  ar: "سعر بيع حديد 12 كجم" },
  "onboarding.field.sellIron48":     { en: "48kg iron sell price",  ar: "سعر بيع حديد 48 كجم" },
  "onboarding.field.buyIron12":      { en: "12kg iron buy price",   ar: "سعر شراء حديد 12 كجم" },
  "onboarding.field.buyIron48":      { en: "48kg iron buy price",   ar: "سعر شراء حديد 48 كجم" },
  "onboarding.field.inventoryFull12":{ en: "12kg full",             ar: "12 كجم ممتلئ" },
  "onboarding.field.inventoryFull48":{ en: "48kg full",             ar: "48 كجم ممتلئ" },
  "onboarding.field.inventoryEmpty12":{ en: "12kg empty",           ar: "12 كجم فارغ" },
  "onboarding.field.inventoryEmpty48":{ en: "48kg empty",           ar: "48 كجم فارغ" },
  "onboarding.field.startingWallet": { en: "Starting wallet",       ar: "رصيد المحفظة الابتدائي" },

  "onboarding.balance.debtsOnDistributor":   { en: "Debts on distributor",   ar: "ديون على الموزع" },
  "onboarding.balance.balanced":             { en: "Balanced",               ar: "متوازن" },
  "onboarding.balance.creditForDistributor": { en: "Credit for distributor", ar: "رصيد للموزع" },

  // ── Daily Reports ────────────────────────────────────────────────────────
  "reports.segmentLedger":           { en: "Ledger",              ar: "السجل" },
  "reports.segmentCustomers":        { en: "Customers",           ar: "العملاء" },
  "reports.segmentCompany":          { en: "Company",             ar: "الشركة" },
  "reports.addExpense":              { en: "Add Expense",         ar: "إضافة مصروف" },
  "reports.preset":                  { en: "Preset",              ar: "محدد مسبقاً" },
  "reports.custom":                  { en: "Custom",              ar: "مخصص" },
  "reports.expenseType":             { en: "Type",                ar: "النوع" },
  "reports.expenseAmount":           { en: "Amount",              ar: "المبلغ" },
  "reports.expenseNote":             { en: "Note",                ar: "ملاحظة" },
  "reports.expenseNotePlaceholder":  { en: "Optional",            ar: "اختياري" },
  "reports.expenseCustomPlaceholder":{ en: "e.g., toll, parking", ar: "مثال: رسوم طريق، موقف" },
  "reports.errorMissingType":        { en: "Missing type",        ar: "النوع مطلوب" },
  "reports.errorSelectEnterType":    { en: "Please select or enter an expense type.", ar: "يرجى اختيار أو إدخال نوع المصروف." },
  "reports.errorInvalidAmount":      { en: "Invalid amount",      ar: "مبلغ غير صالح" },
  "reports.errorEnterValidAmount":   { en: "Please enter a valid amount.", ar: "يرجى إدخال مبلغ صالح." },
  "reports.loadingEvents":           { en: "Loading events...",   ar: "جارٍ تحميل الأحداث..." },
  "reports.loadingActivities":       { en: "Loading activities...", ar: "جارٍ تحميل النشاطات..." },
  "reports.failedLoad":              { en: "Failed to load activities.", ar: "فشل تحميل النشاطات." },
  "reports.noActivities":            { en: "No activities on this day.", ar: "لا توجد نشاطات في هذا اليوم." },
  "reports.selectDay":               { en: "Select a day above.", ar: "اختر يوماً أعلاه." },
  "reports.syncUpdate":              { en: "Sync Update",         ar: "تحديث المزامنة" },
  "reports.syncTooltipMessage":      { en: "Totals refreshed after closing time to include late entries.", ar: "تم تحديث المجاميع بعد وقت الإغلاق لتضمين الإدخالات المتأخرة." },
  "reports.hideDetails":             { en: "Hide details",        ar: "إخفاء التفاصيل" },
  "reports.noStateChange":           { en: "No top-level state change for this activity.", ar: "لا تغيير في الحالة الرئيسية لهذا النشاط." },
  "reports.label12kgFull":           { en: "12kg F",              ar: "12 م" },
  "reports.label12kgEmpty":          { en: "12kg E",              ar: "12 ف" },
  "reports.label48kgFull":           { en: "48kg F",              ar: "48 م" },
  "reports.label48kgEmpty":          { en: "48kg E",              ar: "48 ف" },
  "reports.labelWallet":             { en: "Wallet",              ar: "المحفظة" },
  "reports.expenseFuel":             { en: "fuel",                ar: "وقود" },
  "reports.expenseFood":             { en: "food",                ar: "طعام" },
  "reports.expenseCarTest":          { en: "car test",            ar: "فحص سيارة" },
  "reports.expenseCarRepair":        { en: "car repair",          ar: "إصلاح سيارة" },
  "reports.expenseCarInsurance":     { en: "car insurance",       ar: "تأمين سيارة" },
  "reports.expenseOthers":           { en: "others",              ar: "أخرى" },

  // ── Customers list ───────────────────────────────────────────────────────
  "customers.title":           { en: "Customers",            ar: "العملاء" },
  "customers.searchPlaceholder":{ en: "Search customers",    ar: "بحث عن عميل" },
  "customers.totalDebt":       { en: "Total Debt",           ar: "إجمالي الديون" },
  "customers.unpaid":          { en: "Unpaid Customers",     ar: "العملاء غير المدفوعين" },
  "customers.overdue":         { en: "Overdue (120+ days)",  ar: "متأخر (120+ يوم)" },
  "customers.none":            { en: "None",                 ar: "لا يوجد" },
  "customers.filterAll":       { en: "All",                  ar: "الكل" },
  "customers.filterReplacement":{ en: "Replacement",         ar: "استبدال" },
  "customers.filterLatePayment":{ en: "Late Payment",        ar: "دفع متأخر" },
  "customers.filterReturnEmpties":{ en: "Return Empties",    ar: "إرجاع الفوارغ" },
  "customers.filterBuyEmpty":  { en: "Buy empty",            ar: "شراء فارغة" },
  "customers.filterSellFull":  { en: "Sell full",            ar: "بيع ممتلئ" },
  "customers.filterAdjustments":{ en: "Adjustments",         ar: "تسويات" },

  // ── Add (new activity) screen ────────────────────────────────────────────
  "add.filterAll":            { en: "All",                   ar: "الكل" },
  "add.filterReplacement":    { en: "Replacement",           ar: "استبدال" },
  "add.filterLatePayment":    { en: "Late Payment",          ar: "دفع متأخر" },
  "add.filterReturnEmpties":  { en: "Return Empties",        ar: "إرجاع الفوارغ" },
  "add.filterPayout":         { en: "Payout",                ar: "صرف" },
  "add.errorMissingAmount":   { en: "Missing amount",        ar: "المبلغ مطلوب" },
  "add.errorEnterPayment":    { en: "Enter a payment amount.", ar: "أدخل مبلغ الدفع." },
  "add.errorMissingCounts":   { en: "Missing counts",        ar: "الكميات مطلوبة" },
  "add.errorEnterReturnQty":  { en: "Enter a return quantity.", ar: "أدخل كمية الإرجاع." },
  "add.errorNothingToSave":   { en: "Nothing to save",       ar: "لا يوجد شيء للحفظ" },
  "add.errorNoPriceChanges":  { en: "No price changes to save.", ar: "لا توجد تغييرات في الأسعار للحفظ." },
  "add.errorIncompleteSystem":{ en: "Incomplete system",     ar: "نظام غير مكتمل" },
  "add.errorIncompleteMsg":   { en: "Finish the system details or leave the row blank before saving.", ar: "أكمل تفاصيل النظام أو اترك الصف فارغاً قبل الحفظ." },
  "add.errorFailedDelete":    { en: "Failed to delete",      ar: "فشل الحذف" },
  "add.errorTryAgain":        { en: "Try again later.",      ar: "حاول مجدداً لاحقاً." },
  "add.removeCompanyPayment": { en: "Remove company payment?", ar: "إزالة دفعة الشركة؟" },
  "add.removeCompanyPaymentMsg":{ en: "This will delete the company payment entry.", ar: "سيتم حذف إدخال دفعة الشركة." },
};
```

---

## Step 2 — Create `frontend/lib/i18n/LanguageContext.tsx`

```tsx
// frontend/lib/i18n/LanguageContext.tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Alert, I18nManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";

import { T } from "./translations";

export type AppLanguage = "en" | "ar";
const STORAGE_KEY = "app_language";

type LanguageContextValue = {
  language: AppLanguage;
  isRTL: boolean;
  t: (key: string) => string;
  setLanguage: (lang: AppLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  isRTL: false,
  t: (key) => key,
  setLanguage: async () => {},
});

export function useLanguage() {
  return useContext(LanguageContext);
}

/** Load the saved language from AsyncStorage. Returns "en" if none saved. */
export async function loadSavedLanguage(): Promise<AppLanguage> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === "ar" || saved === "en") return saved;
  } catch {}
  return "en";
}

/** Apply RTL setting synchronously (called on app startup before first render). */
export function applyRTL(lang: AppLanguage) {
  const shouldBeRTL = lang === "ar";
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL);
  }
}

type Props = {
  initialLanguage: AppLanguage;
  children: ReactNode;
};

export function LanguageProvider({ initialLanguage, children }: Props) {
  const [language, setLanguageState] = useState<AppLanguage>(initialLanguage);

  const t = useCallback(
    (key: string): string => {
      const entry = T[key];
      if (!entry) return key;
      return entry[language] ?? entry.en ?? key;
    },
    [language]
  );

  const setLanguage = useCallback(
    async (lang: AppLanguage) => {
      if (lang === language) return;

      await AsyncStorage.setItem(STORAGE_KEY, lang);

      Alert.alert(
        T["language.restartTitle"][lang],
        T["language.restartMessage"][lang],
        [
          {
            text: T["common.ok"][lang],
            onPress: async () => {
              applyRTL(lang);
              try {
                await Updates.reloadAsync();
              } catch {
                // OTA not configured — tell user to restart manually
                Alert.alert(
                  T["language.restartTitle"][lang],
                  "Please close and reopen the app to apply the change."
                );
              }
            },
          },
        ]
      );
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, isRTL: language === "ar", t, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
```

---

## Step 3 — Create `frontend/lib/i18n/fontConfig.ts`

This is the one place to change font families app-wide. New code uses these constants.
Existing screens with hardcoded `NunitoSans` strings are unaffected by this ticket.

```typescript
// frontend/lib/i18n/fontConfig.ts
// Global font family configuration.
// When Arabic is active, pass `undefined` to let the system render Arabic glyphs.

import type { AppLanguage } from "./LanguageContext";

export const FONT_REGULAR   = "NunitoSans-Regular";
export const FONT_SEMIBOLD  = "NunitoSans-SemiBold";
export const FONT_BOLD      = "NunitoSans-Bold";
export const FONT_EXTRABOLD = "NunitoSans-ExtraBold";

/** Returns the correct fontFamily string for the given language.
 *  Arabic returns undefined so the OS falls back to its system Arabic font. */
export function fontFamily(
  lang: AppLanguage,
  weight: "regular" | "semiBold" | "bold" | "extraBold" = "regular"
): string | undefined {
  if (lang === "ar") return undefined;
  return {
    regular:   FONT_REGULAR,
    semiBold:  FONT_SEMIBOLD,
    bold:      FONT_BOLD,
    extraBold: FONT_EXTRABOLD,
  }[weight];
}
```

---

## Step 4 — Create `frontend/lib/i18n/index.ts`

```typescript
// frontend/lib/i18n/index.ts
export { LanguageProvider, useLanguage, loadSavedLanguage, applyRTL } from "./LanguageContext";
export type { AppLanguage } from "./LanguageContext";
export { T } from "./translations";
export { fontFamily, FONT_REGULAR, FONT_SEMIBOLD, FONT_BOLD, FONT_EXTRABOLD } from "./fontConfig";
```

---

## Step 5 — Modify `frontend/app/_layout.tsx`

### What changes
1. Import `LanguageProvider`, `loadSavedLanguage`, `applyRTL` from `@/lib/i18n`.
2. Add a `useState<AppLanguage | null>` for the loaded language.
3. In the same `useEffect` that waits for fonts, also await `loadSavedLanguage()` and call `applyRTL()`.
4. Gate rendering on both `fontsLoaded` **and** `languageLoaded` being non-null.
5. Wrap the tree with `<LanguageProvider initialLanguage={language}>`.

### Exact implementation

**Before (line 24-57):**
```tsx
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "NunitoSans-Regular": require("../assets/fonts/NunitoSans-Regular.ttf"),
    "NunitoSans-SemiBold": require("../assets/fonts/NunitoSans-SemiBold.ttf"),
    "NunitoSans-Bold": require("../assets/fonts/NunitoSans-Bold.ttf"),
    "NunitoSans-ExtraBold": require("../assets/fonts/NunitoSans-ExtraBold.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          ...
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
```

**After:**
```tsx
import { useState, useEffect, type ComponentProps } from "react";
// add to existing imports:
import { LanguageProvider, loadSavedLanguage, applyRTL, type AppLanguage } from "@/lib/i18n";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "NunitoSans-Regular": require("../assets/fonts/NunitoSans-Regular.ttf"),
    "NunitoSans-SemiBold": require("../assets/fonts/NunitoSans-SemiBold.ttf"),
    "NunitoSans-Bold": require("../assets/fonts/NunitoSans-Bold.ttf"),
    "NunitoSans-ExtraBold": require("../assets/fonts/NunitoSans-ExtraBold.ttf"),
  });
  const [language, setLanguage] = useState<AppLanguage | null>(null);

  useEffect(() => {
    loadSavedLanguage().then((lang) => {
      applyRTL(lang);
      setLanguage(lang);
    });
  }, []);

  if (!fontsLoaded || language === null) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <LanguageProvider initialLanguage={language}>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
              <InitializationGuard />
              <Stack screenOptions={{ headerShown: false }} />
              <Toast />
              {Platform.OS === "ios" && (
                <InputAccessoryView nativeID={GLOBAL_ACCESSORY_ID}>
                  <View style={styles.accessoryRow}>
                    <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
                      <Text style={styles.accessoryText}>Done</Text>
                    </Pressable>
                  </View>
                </InputAccessoryView>
              )}
            </SafeAreaView>
          </QueryClientProvider>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
```

> **Note:** The "Done" button text on the iOS keyboard accessory (`<Text style={styles.accessoryText}>Done</Text>`) is outside React context. Leave it hardcoded as "Done" — it is a native keyboard accessory that both English and Arabic users understand.

---

## Step 6 — Modify `frontend/app/(tabs)/_layout.tsx`

Translate each `title` prop using `useLanguage().t`.

```tsx
// Add to imports:
import { useLanguage } from "@/lib/i18n";

export default function TabsLayout() {
  const { t } = useLanguage();
  // ...existing colorScheme code...

  return (
    <Tabs ...>
      <Tabs.Screen name="dashboard"      options={{ title: t("tabs.dashboard"), ... }} />
      <Tabs.Screen name="customers-home" options={{ title: t("tabs.customers"), ... }} />
      <Tabs.Screen name="add/index"      options={{ title: t("tabs.new"),       ... }} />
      <Tabs.Screen name="reports/index"  options={{ title: t("tabs.daily"),     ... }} />
      <Tabs.Screen name="account/index"  options={{ title: t("tabs.account"),   ... }} />
      {/* all other href:null screens unchanged */}
    </Tabs>
  );
}
```

---

## Step 7 — Modify `frontend/app/welcome/index.tsx`

### 7A — Add a language-selection step as step index 0

Insert a new step before the `prices` step. When this step is rendered, show two
large buttons (English / Arabic). Selecting a language calls `setLanguage(lang)` which
saves the preference and triggers a reload. Because `autoAdvance: true` is NOT set for
this step, the user must tap a button to advance.

**Add at top of file (imports):**
```tsx
import { useLanguage } from "@/lib/i18n";
```

**Inside `WelcomeScreen`, add:**
```tsx
const { t, language, setLanguage } = useLanguage();
```

**In the `steps` array, prepend as the first element (before "prices"):**
```typescript
{
  id: "language",
  title: t("language.chooseTitle"),
  question: t("language.chooseSubtitle"),
  explanation: "",
  type: "languagePicker" as const,
},
```

**Add `"languagePicker"` to `StepConfig.type` union:**
```typescript
type: "inputs" | "review" | "netBalance" | "moneyBalance" | "languagePicker";
```

**In the render section that switches on `step.type`, add a case for `"languagePicker"`:**
```tsx
{step.type === "languagePicker" && (
  <View style={styles.languagePickerContainer}>
    <Pressable
      style={[styles.languageOption, language === "en" && styles.languageOptionSelected]}
      onPress={() => setLanguage("en")}
    >
      <Text style={styles.languageOptionText}>{t("language.english")}</Text>
    </Pressable>
    <Pressable
      style={[styles.languageOption, language === "ar" && styles.languageOptionSelected]}
      onPress={() => setLanguage("ar")}
    >
      <Text style={styles.languageOptionText}>{t("language.arabic")}</Text>
    </Pressable>
  </View>
)}
```

**Add styles:**
```typescript
languagePickerContainer: {
  flexDirection: "row",
  gap: 16,
  marginTop: 24,
},
languageOption: {
  flex: 1,
  paddingVertical: 20,
  borderRadius: 12,
  alignItems: "center",
  backgroundColor: "#fff",
  borderWidth: 2,
  borderColor: "#e5e7eb",
},
languageOptionSelected: {
  borderColor: "#0a7ea4",
  backgroundColor: "#e0f2fe",
},
languageOptionText: {
  fontSize: 18,
  fontWeight: "600",
},
```

> **Note:** When the user taps a language button, `setLanguage()` saves the preference
> and shows the restart alert. Because the app restarts, it will re-enter the welcome
> wizard at step 0 with the new language applied. This is intentional.
>
> If the user is already in the correct language and taps the same language button,
> `setLanguage` is a no-op (language === current language, early return).
>
> The "Next" / "Back" buttons advance past this step as normal if the user skips it.

### 7B — Translate all hardcoded wizard strings

Replace all hardcoded strings in `StepConfig` objects and render sections with `t()`:

| Hardcoded string | Replace with |
|-----------------|--------------|
| `"Prices"` (step title) | `t("onboarding.step.prices.title")` |
| `"What do you charge for a 12kg..."` | `t("onboarding.step.prices.question")` |
| `"You can change these later..."` | `t("onboarding.step.prices.explanation")` |
| `"Company"` | `t("onboarding.step.company.title")` |
| `"What is your current money balance..."` | `t("onboarding.step.company.question")` |
| `"Record whether you owe..."` | `t("onboarding.step.company.explanation")` |
| `"Company Cylinders"` | `t("onboarding.step.companyCylinders.title")` |
| `"What is your current cylinder balance..."` | `t("onboarding.step.companyCylinders.question")` |
| `"Record the current credit..."` | `t("onboarding.step.companyCylinders.explanation")` |
| `"Inventory"` (full) | `t("onboarding.step.inventoryFull.title")` |
| `"How many full tanks..."` | `t("onboarding.step.inventoryFull.question")` |
| `"Everything combined..."` | `t("onboarding.step.inventoryFull.explanation")` |
| `"Inventory"` (empty) | `t("onboarding.step.inventoryEmpty.title")` |
| `"How many empty tanks..."` | `t("onboarding.step.inventoryEmpty.question")` |
| `"All spare empties..."` | `t("onboarding.step.inventoryEmpty.explanation")` |
| `"Wallet"` | `t("onboarding.step.wallet.title")` |
| `"How much money is in your wallet..."` | `t("onboarding.step.wallet.question")` |
| `"This is your wallet balance..."` | `t("onboarding.step.wallet.explanation")` |
| `"Review"` | `t("onboarding.step.review.title")` |
| `"Review your opening balances"` | `t("onboarding.step.review.question")` |
| `"Confirm these values..."` | `t("onboarding.step.review.explanation")` |
| `"12kg selling price"` | `t("onboarding.field.sell12")` |
| `"48kg selling price"` | `t("onboarding.field.sell48")` |
| `"12kg buying price"` | `t("onboarding.field.buy12")` |
| `"48kg buying price"` | `t("onboarding.field.buy48")` |
| `"12kg iron sell price"` | `t("onboarding.field.sellIron12")` |
| `"48kg iron sell price"` | `t("onboarding.field.sellIron48")` |
| `"12kg iron buy price"` | `t("onboarding.field.buyIron12")` |
| `"48kg iron buy price"` | `t("onboarding.field.buyIron48")` |
| `"12kg full"` | `t("onboarding.field.inventoryFull12")` |
| `"48kg full"` | `t("onboarding.field.inventoryFull48")` |
| `"12kg empty"` | `t("onboarding.field.inventoryEmpty12")` |
| `"48kg empty"` | `t("onboarding.field.inventoryEmpty48")` |
| `"Starting wallet"` | `t("onboarding.field.startingWallet")` |
| `"Back"` button | `t("common.back")` |
| `"Next"` button | `t("common.next")` |
| `"Confirm & Start Business"` | `t("onboarding.confirmStart")` |
| `"Starting..."` | `t("onboarding.starting")` |
| `"No opening balances provided."` | `t("onboarding.noOpeningBalances")` |
| `"Debts on distributor"` (summary line prefix) | `t("onboarding.balance.debtsOnDistributor")` |
| `"Credit for distributor"` (summary line prefix) | `t("onboarding.balance.creditForDistributor")` |

> The `steps` array is inside `useMemo`. Because it now calls `t()` which depends on
> `language`, add `language` (or `t`) to the `useMemo` dependency array:
> `useMemo(() => [...], [language])` — or `[t]` if `t` is stable (it is, from `useCallback`).

---

## Step 8 — Modify `frontend/app/(tabs)/account/index.tsx`

### 8A — Add language switcher UI + translate all strings

```tsx
import { useLanguage } from "@/lib/i18n";

export default function AccountScreen() {
  const { logout } = useAuth();
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();

  function handleLogout() {
    Alert.alert(t("account.signOutTitle"), t("account.signOutMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("account.signOut"),
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("account.title")}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("account.sectionBusiness")}</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/business-profile")}>
          <Text style={styles.rowText}>{t("account.menuBusinessProfile")}</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("account.sectionSubscription")}</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/plan-billing")}>
          <Text style={styles.rowText}>{t("account.menuPlanBilling")}</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("account.sectionTeam")}</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/workers")}>
          <Text style={styles.rowText}>{t("account.menuWorkers")}</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("account.sectionConfiguration")}</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/prices")}>
          <Text style={styles.rowText}>{t("account.menuPrices")}</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/system-types")}>
          <Text style={styles.rowText}>{t("account.menuSystemTypes")}</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/expense-categories")}>
          <Text style={styles.rowText}>{t("account.menuExpenseCategories")}</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/currency-settings")}>
          <Text style={styles.rowText}>{t("account.menuCurrency")}</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("account.sectionSecurity")}</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/change-password")}>
          <Text style={styles.rowText}>{t("account.menuChangePassword")}</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
      </View>

      {/* ── Appearance section with Language toggle ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("account.sectionAppearance")}</Text>
        <View style={styles.row}>
          <Text style={styles.rowText}>{t("account.menuLanguage")}</Text>
          <View style={styles.langToggle}>
            <Pressable
              style={[styles.langOption, language === "en" && styles.langOptionActive]}
              onPress={() => setLanguage("en")}
            >
              <Text style={[styles.langOptionText, language === "en" && styles.langOptionTextActive]}>
                EN
              </Text>
            </Pressable>
            <Pressable
              style={[styles.langOption, language === "ar" && styles.langOptionActive]}
              onPress={() => setLanguage("ar")}
            >
              <Text style={[styles.langOptionText, language === "ar" && styles.langOptionTextActive]}>
                عربي
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t("account.signOut")}</Text>
      </Pressable>
    </View>
  );
}
```

**Add to `styles`:**
```typescript
langToggle: {
  flexDirection: "row",
  borderRadius: 8,
  overflow: "hidden",
  borderWidth: 1,
  borderColor: "#e5e7eb",
},
langOption: {
  paddingHorizontal: 14,
  paddingVertical: 6,
  backgroundColor: "#f1f5f9",
},
langOptionActive: {
  backgroundColor: "#0a7ea4",
},
langOptionText: {
  fontSize: 13,
  color: "#555",
  fontWeight: "600",
},
langOptionTextActive: {
  color: "#fff",
},
```

---

## Step 9 — Modify `frontend/app/login.tsx`

```tsx
import { useLanguage } from "@/lib/i18n";

export default function LoginScreen() {
  const { t } = useLanguage();
  // ...existing hooks...

  // Replace all hardcoded strings:
  // "Welcome Back"                              → t("login.title")
  // "Sign in to continue"                       → t("login.subtitle")
  // "Phone number"                              → t("login.phonePlaceholder")
  // "Password"                                  → t("login.passwordPlaceholder")
  // "Sign In"                                   → t("login.signIn")
  // "Phone and password are required"           → t("login.errorRequired")
  // "Incorrect phone number or password"        → t("login.errorCredentials")
  // "Account not yet activated..."              → t("login.errorInactive")
  // "Could not connect. Please try again."      → t("login.errorConnect")
}
```

---

## Step 10 — Modify `frontend/app/(tabs)/account/change-password.tsx`

Add `const { t } = useLanguage();` and replace all hardcoded strings using the
`changePassword.*` keys from the translation table.

Key replacements:
- `"Change Password"` (title) → `t("changePassword.title")`
- `"Current password"` (placeholder) → `t("changePassword.current")`
- `"New password"` (placeholder) → `t("changePassword.new")`
- `"Confirm new password"` (placeholder) → `t("changePassword.confirm")`
- `"Update Password"` (button) → `t("changePassword.updateButton")`
- `"Cancel"` → `t("common.cancel")`
- `"All fields are required"` → `t("changePassword.errorRequired")`
- `"New passwords do not match"` → `t("changePassword.errorMismatch")`
- `"New password must be at least 8 characters"` → `t("changePassword.errorTooShort")`
- `"Current password is incorrect"` → `t("changePassword.errorIncorrect")`
- `"Failed to change password. Please try again."` → `t("changePassword.errorFailed")`
- `"Password changed successfully"` (toast) → `t("changePassword.successToast")`

---

## Step 11 — Modify `frontend/app/(tabs)/account/business-profile.tsx`

Add `const { t } = useLanguage();` and replace using `businessProfile.*` keys:

- `"Business Profile"` → `t("businessProfile.title")`
- `"Back"` → `t("common.back")`
- `"Business name"` placeholder → `t("businessProfile.businessName")`
- `"Owner name"` placeholder → `t("businessProfile.ownerName")`
- `"Phone"` placeholder → `t("businessProfile.phone")`
- `"Address"` placeholder → `t("businessProfile.address")`
- `"Save"` → `t("common.save")`
- Alert title `"Saved"` → `t("businessProfile.savedTitle")`
- Alert message `"Profile updated."` → `t("businessProfile.savedMessage")`
- Alert title `"Error"` → `t("businessProfile.errorTitle")`
- Alert message `"Could not save profile."` → `t("businessProfile.errorMessage")`

---

## Step 12 — Modify `frontend/app/(tabs)/account/workers.tsx`

Add `const { t } = useLanguage();` and replace using `workers.*` keys (see translation
table). Key items: role label strings (Driver/Cashier/Accountant), phone placeholder,
all Alert titles/messages, "Cancel invite?" → `t("workers.cancelInviteTitle")`, etc.

---

## Step 13 — Modify `frontend/app/(tabs)/reports/index.tsx`

Add `const { t } = useLanguage();` and replace UI chrome strings using `reports.*` keys.

**Do NOT translate:** event descriptions, customer/company names, date strings,
financial amounts, or any text that originates from the backend.

Key replacements (non-exhaustive — apply all `reports.*` keys from translation table):
- Segment labels: `"Ledger"`, `"Customers"`, `"Company"`
- Expense modal: `"Add Expense"`, `"Preset"`, `"Custom"`, `"Type"`, `"Amount"`, `"Note"`, `"Optional"`, etc.
- Error/empty states: all strings in the `reports.*` namespace
- Expense type preset list: replace with `t("reports.expenseFuel")` etc.
- Inventory row labels in the summary header: `"12kg F"` → `t("reports.label12kgFull")`, etc.

---

## Step 14 — Modify `frontend/app/(tabs)/customers-home/index.tsx`

Add `const { t } = useLanguage();` and replace using `customers.*` keys:
- `"Customers"` (title), `"Search customers"` placeholder
- `"Total Debt"`, `"Unpaid Customers"`, `"Overdue (120+ days)"`, `"None"`
- Filter labels: `"All"`, `"Replacement"`, `"Late Payment"`, `"Return Empties"`, etc.

---

## Step 15 — Modify `frontend/app/(tabs)/add/index.tsx`

Add `const { t } = useLanguage();` and replace using `add.*` keys:
- Filter labels: `"All"`, `"Replacement"`, `"Late Payment"`, `"Return Empties"`, `"Payout"`
- Alert strings for all `add.*` keys (missing amounts, counts, incomplete system, etc.)

---

## Verification

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

Then check each screen manually:

**Language switch (Settings):**
- Tap "عربي" in the Account screen → alert shows in Arabic → confirm → app restarts in Arabic RTL ✓
- Tap "EN" → app restarts in English LTR ✓

**Language switch (Onboarding):**
- Fresh install → first wizard step shows two language buttons ✓
- Selecting Arabic triggers reload; wizard resumes in Arabic ✓
- Pressing "Next" without selecting a language advances to Prices step in current language ✓

**Login screen:**
- All labels/placeholders appear in the active language ✓
- Error messages appear in the active language ✓

**Account screen:**
- All section titles and menu items translated ✓
- Language toggle shows current language as highlighted ✓

**Reports screen:**
- Segment labels, expense modal, and empty states translated ✓
- Dynamic event descriptions remain in English (they come from backend) ✓

**RTL layout (Arabic):**
- App layout mirrors left-to-right → right-to-left ✓
- Tab bar icons are on the correct sides ✓

---

## Known limitations (follow-up tickets)

1. **Existing `fontFamily: "NunitoSans-*"` calls** throughout the codebase are not
   changed in this ticket. Arabic glyphs fall back to the OS Arabic font automatically.
   A follow-up ticket will migrate all `fontFamily` strings to use `fontConfig.ts`.

2. **Components not listed above** (AddRefillModal, PriceInputForm, order/new,
   inventory/new, etc.) still have hardcoded English strings. Phase 2 of this ticket
   will cover them.

3. **RTL layout may not be perfect** on first pass for screens with explicit
   `flexDirection: "row"` + `textAlign: "left"` overrides. A visual QA pass after
   this ticket ships will identify any layout items needing explicit RTL fixes.
