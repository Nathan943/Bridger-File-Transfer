//Files over this limit will not be stored
const FILE_STORAGE_LIMIT = 256 * 1024 * 1024;

//Handle the storage and retrieval of files in IndexedDB
class FileStorageHandler {
	//Initialize database object
	private request: IDBOpenDBRequest | null = null;
	private db: IDBDatabase | null = null;


	//Connect to the database
	async connect(): Promise<void> {
		if (this.db) return;

		return new Promise((resolve, reject) => {
			//Open the database with version number
			this.request = window.indexedDB.open("AppStorage", 4);

			this.request.onerror = () => reject(this.request?.error);

			//The client side has to update the database itself as IndexedDB is stored locally in the browser and offline
			this.request.onupgradeneeded = (event) => {
				this.db = (event.target as IDBOpenDBRequest).result;

				//If the schema to store messages doesn't exist, create it
				if (!this.db.objectStoreNames.contains("messages")) {
					const store = this.db.createObjectStore("messages", {
						keyPath: "id",
					});

					this.db.createObjectStore("keys", {
						keyPath: "id",
					});

					//Allow searching by timestamp
					store.createIndex("timestamp", "timestamp");
				}
			};

			this.request.onsuccess = (event) => {
				this.db = (event.target as IDBOpenDBRequest).result;

				resolve();
			};
		});
	}



	//Add a file to the database
	async addFile(fileId: string, file: File): Promise<void> {
		if (!this.db) {
			throw new Error("Database not found");
		}

		//Cap size of file uploaded to the database
		if (file.size > FILE_STORAGE_LIMIT) {
			console.log("File too large to be stored");
			return;
		}

		//Get the storage estimate
		let estimate = await navigator.storage.estimate();

		//If adding a file would exceed 90% of the allocated storage quota, free up space by removing the oldest files
		while (
			estimate.usage &&
			estimate.quota &&
			estimate.usage + file.size > estimate.quota * 0.9
		) {
			await this.deleteOldestFile();
			estimate = await navigator.storage.estimate();
		}

		//Add the file to the database, logging the time
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction("messages", "readwrite");
			const store = transaction.objectStore("messages");

			const request = store.put({
				id: fileId,
				file: file,
				timestamp: Date.now(),
			});

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}


	//Delete a file
	async deleteFile(fileId: string) {
		if (!this.db) return;

		const transaction = this.db.transaction("messages", "readwrite");
		const store = transaction.objectStore("messages");

		store.delete(fileId);

		return new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
	}



	//Get a file
	async getFile(fileId: string): Promise<File | null> {
		if (!this.db) {
			return null;
		}

		//Access by file id
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction("messages", "readonly");
			const store = transaction.objectStore("messages");

			const request = store.get(fileId);

			request.onsuccess = () => {
				resolve(request.result?.file ?? null);
			};

			request.onerror = () => {
				reject(request.error);
			};
		});
	}



	//Remove the oldest file from the database (used when space is overflowing)
	async deleteOldestFile(): Promise<void> {
		if (!this.db) {
			throw new Error("Database not found");
		}

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction("messages", "readwrite");
			const store = transaction.objectStore("messages");
			const index = store.index("timestamp");

			const request = index.openCursor();

			request.onsuccess = () => {
				const result = request.result;

				if (!result) {
					resolve();
					return;
				}

				const deleteRequest = store.delete(result.primaryKey);

				deleteRequest.onsuccess = () => resolve();
				deleteRequest.onerror = () => reject(deleteRequest.error);
			};

			request.onerror = () => {
				reject(request.error);
			};
		});
	}
}

export default new FileStorageHandler();
