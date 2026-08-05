# הפעלת חשבונות משתמשים (Firebase)

הקוד כבר באתר — כפתור ההתחברות (👤) מופיע אוטומטית ברגע שמדביקים את
מפתחות Firebase ב-`config.json`. עד אז האתר מתנהג בדיוק כמו קודם
(מצב אורח, הכל ב-localStorage).

מה המשתמשים מקבלים: התחברות במייל+סיסמה או Google, והטיוטות / מזהה
הקבוצה / רשימת המעקב / ההעדפות שלהם מסונכרנים בין מכשירים.

## צ׳קליסט חד-פעמי (~5 דקות)

1. **יצירת פרויקט**: היכנסו ל-<https://console.firebase.google.com>
   ← Add project ← שם: `amitfpl` (בלי Google Analytics, לא צריך).

2. **אפליקציית ווב**: במסך הפרויקט ← אייקון `</>` (Add app → Web) ←
   כינוי `amitfpl-web` ← Register. יופיע לכם אובייקט `firebaseConfig` —
   העתיקו אותו.

3. **הפעלת ספקי התחברות**: Build → Authentication → Get started →
   Sign-in method:
   - **Email/Password** → Enable → Save
   - **Google** → Enable → בחרו support email → Save

4. **דומיין מורשה**: Authentication → Settings → Authorized domains →
   Add domain → `stevengerrardsg8.github.io`
   (בשביל פיתוח מקומי `localhost` כבר שם).

5. **מסד נתונים**: Build → Firestore Database → Create database →
   Start in **production mode** → location: `eur3 (europe-west)`.

6. **חוקי אבטחה**: Firestore → Rules → הדביקו את זה בדיוק → Publish:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

   (כל משתמש קורא וכותב רק את המסמך של עצמו. שום דבר אחר לא נגיש.)

7. **הדבקת המפתחות**: ב-`config.json` החליפו את `"firebase": null` ב:

   ```json
   "firebase": {
     "apiKey": "...",
     "authDomain": "amitfpl.firebaseapp.com",
     "projectId": "amitfpl",
     "storageBucket": "amitfpl.appspot.com",
     "messagingSenderId": "...",
     "appId": "..."
   }
   ```

   (הערכים מ-שלב 2. זה מפתח **ציבורי** — בטוח לשמור אותו בריפו;
   האבטחה מגיעה מחוקי Firestore של שלב 6.)

8. `git add config.json && git commit && git push` — וזהו. הכפתור 👤
   יופיע בכותרת תוך דקות.

## איך זה עובד

- `js/auth.js` נטען תמיד אבל לא עושה כלום בלי config — אפס השפעה על
  משתמשים שלא מתחברים.
- אחרי התחברות: הנתונים המקומיים נמשכים מהענן (הענן גובר אם קיים),
  ומשם כל שינוי נדחף אוטומטית כל 15 שניות + ביציאה מהדף.
- מה מסונכרן: שלוש טיוטות המתכנן, סלוט פעיל, מזהה קבוצה, רשימת מעקב,
  השוואה, שפה, ערכת נושא, טאב אחרון.
- Firestore חינמי עד 50K קריאות/20K כתיבות ביום — מספיק למאות משתמשים.
