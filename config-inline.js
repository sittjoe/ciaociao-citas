// Firebase Configuration — API key is intentionally public (Firebase web pattern)
// Admin password is NO LONGER stored here — verification happens server-side via Cloud Function

export const firebaseConfig = {
    apiKey: "AIzaSyBxNIfANjQhnHtzr0SMYwMXwvMizpJo-p0",
    authDomain: "ciaociao-citas.firebaseapp.com",
    projectId: "ciaociao-citas",
    storageBucket: "ciaociao-citas.firebasestorage.app",
    messagingSenderId: "750282945341",
    appId: "1:750282945341:web:72d5cfe27769260b648b54"
};

export const adminEmail = "info@ciaociao.mx";

// EmailJS — public key is by design public in EmailJS SDK
// TODO Phase 5: move email sending to Cloud Functions with Resend
export const emailConfig = {
    publicKey: "AyFUquhb1yytve6Lv",
    serviceId: "service_swd9ilc",
    templateId: "template_hsqbxmy"
};
