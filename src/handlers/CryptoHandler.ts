import { EncryptedFileData } from "../types/types";

const CHUNK_SIZE = 1024 * 1024;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);

	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	return bytes.buffer;
}

class CryptoHandler {
	private publicKey: CryptoKey | null = null;
	private privateKey: CryptoKey | null = null;

	private otherPublicKeys = new Map<string, CryptoKey>();

	//Initialize database object
	private request: IDBOpenDBRequest | null = null;
	private db!: IDBDatabase;

	async initialize() {
		await this.openDatabase();
		await this.loadKeys();

		if (!this.publicKey || !this.privateKey) {
			await this.generateKeyPair();
		}
	}

	private async generateKeyPair(): Promise<void> {
		const keyPair = await crypto.subtle.generateKey(
			{ name: "X25519" },
			false,
			["deriveKey"],
		);

		this.publicKey = keyPair.publicKey;
		this.privateKey = keyPair.privateKey;

		await this.saveKeys();

		await this.loadKeys();
	}

	async exportPublicKey() {
		if (!this.publicKey) {
			throw new Error("Public key not intialized");
		}

		const publicKeyBuffer = await crypto.subtle.exportKey(
			"raw",
			this.publicKey,
		);

		return arrayBufferToBase64(publicKeyBuffer);
	}

	async importPublicKey(
		base64Key: string,
		targetClientId: string,
	): Promise<void> {
		const rawKey = base64ToArrayBuffer(base64Key);

		this.otherPublicKeys.set(
			targetClientId,
			await crypto.subtle.importKey(
				"raw",
				rawKey,
				{ name: "X25519" },
				false,
				[],
			),
		);
	}

	private async deriveSharedKey(
		otherPublicKey: CryptoKey,
	): Promise<CryptoKey> {
		if (!this.privateKey) throw new Error("Private key not initialized");

		return await crypto.subtle.deriveKey(
			{ name: "X25519", public: otherPublicKey },
			this.privateKey,
			{ name: "AES-GCM", length: 256 },
			false,
			["encrypt", "decrypt"],
		);
	}

	getBaseIv(): Uint8Array<ArrayBuffer> {
		return crypto.getRandomValues(new Uint8Array(12));
	}

	toBase64(iv: Uint8Array) {
		return arrayBufferToBase64(iv.buffer as ArrayBuffer);
	}

	private makeIv(
		baseIV: Uint8Array<ArrayBuffer>,
		chunkNumber: number,
	): Uint8Array<ArrayBuffer> {
		const iv = new Uint8Array(baseIV);

		const view = new DataView(iv.buffer, iv.byteOffset, iv.byteLength);

		view.setUint32(8, chunkNumber, false);

		return iv;
	}

	async encryptChunk(
		chunk: ArrayBuffer,
		targetClientId: string,
		baseIv: Uint8Array<ArrayBuffer>,
		chunkNumber: number,
	): Promise<ArrayBuffer> {
		const otherPublicKey = this.otherPublicKeys.get(targetClientId);

		if (!otherPublicKey) throw new Error("Other public key not found");

		const aesKey = await this.deriveSharedKey(otherPublicKey);

		const iv = this.makeIv(baseIv, chunkNumber);

		return crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, chunk);
	}

	async decryptChunk(
		encryptedChunk: ArrayBuffer,
		targetClientId: string,
		ivBase64: string,
		chunkNumber: number,
	): Promise<ArrayBuffer> {
		const otherPublicKey = this.otherPublicKeys.get(targetClientId);

		if (!otherPublicKey) {
			throw new Error("Other public key not found");
		}

		const aesKey = await this.deriveSharedKey(otherPublicKey);

		const baseIv = new Uint8Array(base64ToArrayBuffer(ivBase64));
		const iv = this.makeIv(baseIv, chunkNumber);

		return await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv,
			},
			aesKey,
			encryptedChunk,
		);
	}

	//Connect to the database
	private async openDatabase(): Promise<void> {
		if (this.db) return;

		return new Promise((resolve, reject) => {
			//Open the database with version number
			this.request = window.indexedDB.open("AppStorage", 4);

			this.request.onerror = () => reject(this.request?.error);

			//The client side has to update the database itself as IndexedDB is stored locally in the browser and offline
			this.request.onupgradeneeded = (event) => {
				this.db = (event.target as IDBOpenDBRequest).result;

				//If the schema to store messages doesn't exist, create it
				if (!this.db.objectStoreNames.contains("keys")) {
					const store = this.db.createObjectStore("messages", {
						keyPath: "id",
					});

					this.db.createObjectStore("keys", {
						keyPath: "id",
					});

					store.createIndex("timestamp", "timestamp");
				}
			};

			this.request.onsuccess = (event) => {
				this.db = (event.target as IDBOpenDBRequest).result;

				resolve();
			};
		});
	}

	private async saveKeys(): Promise<void> {
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction("keys", "readwrite");
			const store = transaction.objectStore("keys");

			store.put({
				id: "public",
				key: this.publicKey,
			});

			store.put({
				id: "private",
				key: this.privateKey,
			});

			transaction.oncomplete = () => resolve();

			transaction.onerror = () => reject(transaction.error);
		});
	}

	private async loadKeys(): Promise<void> {
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction("keys", "readonly");
			const store = transaction.objectStore("keys");

			const publicKeyRequest = store.get("public");
			const privateKeyRequest = store.get("private");

			publicKeyRequest.onsuccess = () => {};

			privateKeyRequest.onsuccess = () => {};

			transaction.oncomplete = () => {
				this.publicKey = publicKeyRequest.result?.key ?? null;
				this.privateKey = privateKeyRequest.result?.key ?? null;
				resolve();
			};

			transaction.onerror = () => reject(transaction.error);
		});
	}

	async checkKey(
		targetClientId: string,
		receivedKey: string,
	): Promise<boolean> {
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction("keys", "readonly");
			const store = transaction.objectStore("keys");

			const request = store.get(targetClientId);

			request.onsuccess = () => {
				const storedKey = request.result?.key;

				//No key is stored yet, so trust this one
				if (!storedKey) {
					const writeTransaction = this.db.transaction(
						"keys",
						"readwrite",
					);
					writeTransaction.objectStore("keys").put({
						id: targetClientId,
						key: receivedKey,
					});

					writeTransaction.oncomplete = () => resolve(true);
					writeTransaction.onerror = () =>
						reject(writeTransaction.error);
					return;
				}

				//Compare keys
				if (storedKey != receivedKey) {
					const writeTransaction = this.db.transaction(
						"keys",
						"readwrite",
					);

					writeTransaction.objectStore("keys").put({
						id: targetClientId,
						key: receivedKey,
					});

					writeTransaction.oncomplete = () => resolve(true);
					writeTransaction.onerror = () =>
						reject(writeTransaction.error);

					return;
				}

				resolve(true);
			};

			transaction.onerror = () => reject(transaction.error);
		});
	}
}

export default new CryptoHandler();
