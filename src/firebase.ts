import { initializeApp } from "firebase/app";
import { initializeFirestore, memoryLocalCache, doc } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with memory cache to avoid IndexedDB batch assertion errors in iframe environments
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: memoryLocalCache()
}, firebaseConfig.firestoreDatabaseId || "(default)");

// Test connection silently to ensure database is responsive
async function testConnection() {
  try {
    const { getDoc } = await import("firebase/firestore");
    await getDoc(doc(db, "_test_connection", "ping"));
  } catch (_error) {
    // Silent catch for initial connection check
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: "local-user",
      email: "local-user@example.com",
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function logAuditAction(username: string, role: string, actionType: 'login' | 'logout' | 'view' | 'modify', detail: string, isPasskeyLogin: boolean = false) {
  try {
    const { collection, addDoc } = await import("firebase/firestore");
    await addDoc(collection(db, "login_history"), {
      username,
      role,
      actionType,
      detail,
      isPasskeyLogin,
      timestamp: new Date().toISOString()
    });

    if (actionType === "login") {
      await addDoc(collection(db, "notifications"), {
        horseId: "system",
        horseName: "System Auth",
        type: "login_activity",
        username,
        message: `${username} (${role})${isPasskeyLogin ? " via Passkey" : ""} logged in: ${detail}`,
        dueDate: new Date().toISOString().substring(0, 10),
        status: "unread",
        createdAt: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error("Failed to write audit action log:", error);
  }
}

export { app, db };
