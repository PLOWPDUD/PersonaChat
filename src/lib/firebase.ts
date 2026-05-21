import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, signInAnonymously as firebaseSignInAnonymously } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Use the same database for shards for now to ensure security rules are applied correctly
export const dbChat = db;
export const dbPrivate = db;

export const auth = getAuth(app);
export const storage = getStorage(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
  } else if (err.code == 'unimplemented') {
    console.warn('The current browser does not support persistence.');
  }
});
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function isQuotaError(error: any): boolean {
  if (!error) return false;
  const message = (error.message || String(error)).toLowerCase();
  return (
    message.includes('quota limit exceeded') || 
    message.includes('quota exceeded') || 
    message.includes('resource-exhausted') || 
    error.code === 'resource-exhausted'
  );
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };

  // If it's a quota error, we log it as a warning instead of a full error to avoid SDK assertion failures if possible
  if (isQuotaError(error)) {
    console.warn('Firestore Quota Exceeded: ', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  
  throw new Error(JSON.stringify(errInfo));
}

export const isInsideMedianApp = (): boolean => {
  if (typeof window === 'undefined' || !window.navigator) return false;
  const ua = window.navigator.userAgent || window.navigator.vendor || '';
  return /gonative|median/i.test(ua.toLowerCase());
};

export const isMobileOrWebView = (): boolean => {
  if (typeof window === 'undefined' || !window.navigator) return false;
  const ua = window.navigator.userAgent || window.navigator.vendor || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isWebView = /gonative|median|webview|wv|ip(hone|od|ad).*applewebkit|android.*webkit/i.test(ua.toLowerCase());
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone;
  return isMobile || isWebView || !!isStandalone;
};

export const signInWithGoogle = async () => {
  try {
    if (isInsideMedianApp()) {
      console.log('Median / GoNative App WebView detected. Opening Google login in external system browser.');
      const transferId = 'tx_' + Math.floor(Math.random() * 1000000) + '_' + Date.now();
      localStorage.setItem('median_auth_transfer_id', transferId);
      const googleLoginUrl = `${window.location.origin}/login?trigger_google=true&transfer_id=${transferId}`;
      const nativeScheme = /median/i.test(window.navigator.userAgent) ? 'median' : 'gonative';
      window.location.href = `${nativeScheme}://openExternalBrowser?url=${encodeURIComponent(googleLoginUrl)}`;
      return null;
    }

    if (isMobileOrWebView()) {
      console.log('Mobile browser detected. Using signInWithRedirect.');
      await signInWithRedirect(auth, googleProvider);
      return null;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (popupError: any) {
      const closedOrBlocked = 
        popupError?.code === 'auth/popup-blocked' || 
        popupError?.code === 'auth/popup-closed-by-user' ||
        popupError?.code === 'auth/cancelled-popup-request';
        
      if (closedOrBlocked) {
        console.warn('Google Sign-In popup blocked or closed. Falling back to signInWithRedirect.');
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
      throw popupError;
    }
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const signInAnonymously = async () => {
  try {
    const result = await firebaseSignInAnonymously(auth);
    return result.user;
  } catch (error) {
    console.error('Error signing in anonymously:', error);
    throw error;
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};
