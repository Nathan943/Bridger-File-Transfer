/*
    Client application for the file transfer system
*/

import { Client, TemporaryFile, IncomingTransfer } from "../types/types";
import cryptoHandler from "./CryptoHandler";
import notificationSound from "../sounds/notification.mp3";

//Files are sent in chunks of CHUNK_SIZE
const CHUNK_SIZE = 256 * 1024;

//Handle everything to do with the connection to the server and other clients
class SocketHandler {
	//WebSocket connection
	private socket: WebSocket | null = null;

	//This client's id
	private clientId = "";

	//Stores the client a file is being sent from
	private incomingTransfers = new Map<string, IncomingTransfer>();
	private outgoingTransfers = new Map<string, string>();


	//User specific app settings
	private autoDownload = false;
	private soundOnDownload = false;

	private downloadSound = new Audio(notificationSound);


	private decoder = new TextDecoder();

	/*
	Callback functions so App can receive data
	*/
	private onPairCodeReceivedCallback?: (code: number) => void;
	private onNameReceivedCallback?: (
		name: string,
		isPrimaryTab: boolean,
	) => void;
	private onClientConnectedCallback?: (client: Client) => void;
	private onFileReceivedCallback?: (
		client: Client,
		file: File,
		messageId: string,
	) => void;
	private onContactsReceivedCallback?: (contacts: Client[]) => void;
	private onClientOnlineStatusChangeCallback?: (
		targetClientId: string,
		online: boolean,
	) => void;
	private onClientRemovedCallback?: (clientId: string) => void;
	private onNameChangedCallback?: (
		targetClientId: string,
		name: string,
	) => void;
	private onFileSentCallback?: (messageId: string) => void;
	private onFileFailedCallback?: (messageId: string) => void;
	private onMetaReceivedCallback?: (
		client: Client,
		file: TemporaryFile,
		messageId: string,
	) => void;
	private updateProgressBarCallback?: (
		messageId: string,
		progress: number,
	) => void;
	private onConnectionStatusChangeCallback?: (connected: boolean) => void;



	//Initialize WebSocket connection
	connect(authToken: string | null) {
		const wsUrl = "wss://ws.nathanpederson.com";
		this.socket = new WebSocket(wsUrl);

		//Connect to the server and tell it that this client is online
		this.socket.addEventListener("open", async () => {
			this.onConnectionStatusChangeCallback?.(true);

			this.socket?.send(
				JSON.stringify({
					signal: "ON_CLIENT_CONNECT",
					authToken,
					publicKey: await cryptoHandler.exportPublicKey(),
				}),
			);
		});

		//Listen for messages from the server
		this.socket.addEventListener("message", async (msg) => {
			//Check for raw file data first, that is a chunk of data coming in
			if (typeof msg.data !== "string") {
				//Decode the binary chunk
				const bytes = new Uint8Array(await msg.data.arrayBuffer());

				const messageId = this.decoder.decode(bytes.subarray(0, 36));

				const transfer = this.incomingTransfers.get(messageId);
				if (!transfer) return;

				//Then decrypt
				const chunk = bytes.slice(36);
				const decryptedChunk = await cryptoHandler.decryptChunk(
					chunk.buffer,
					transfer.client.id,
					transfer.iv,
					transfer.receivedChunks,
				);

				//Add to the specified transfer
				transfer.file.chunks.push(decryptedChunk);
				transfer.receivedChunks++;
				transfer.receivedBytes += decryptedChunk.byteLength;


				//If transfer is done
				if (transfer.receivedBytes >= transfer.file.size) {
					//Reconstruct a file now that all information has been sent, and send the file to App
					const client = transfer.client;
					const file = transfer.file;

					const reconstructedBlob = new Blob(file.chunks, {type: file.type});

					const reconstructedFile = new File(
						[reconstructedBlob],
						file.name,
						{ type: file.type },
					);

					this.onFileReceivedCallback?.(
						client,
						reconstructedFile,
						messageId,
					);

					this.socket?.send(
						JSON.stringify({
							signal: "TRANSFER_SUCCESS",
							messageId,
						}),
					);

					//Check if the automatic download settings is enabled, and if so download a copy immediately
					if (this.autoDownload) {
						const url = URL.createObjectURL(reconstructedFile);

						const a = document.createElement("a");
						a.href = url;
						a.download = reconstructedFile.name;
						a.style.display = "none";

						document.body.appendChild(a);
						a.click();
						document.body.removeChild(a);

						setTimeout(() => URL.revokeObjectURL(url), 1000);
					}

					//Play a sound if the setting is enabled
					if (this.soundOnDownload) {
						this.playDownloadSound();
					}

					//Delete the incoming transfer object as it is finished
					this.incomingTransfers.delete(messageId);
				} else {

					//Otherwise, transfer is still ongoing, so update progress bar UI
					const progress =
						(transfer.file.chunks.length * CHUNK_SIZE) /
						transfer.file.size;
					this.updateProgressBarCallback?.(messageId, progress);
				}

				return;
			}


			//If not raw file data, parse the JSON message
			const parsedMessage = JSON.parse(msg.data);


			/*
			Decide what to do with the message
			*/
			switch (parsedMessage.signal) {
				case "PAIRING_CODE":
					//Display pairing code in App
					const pairingCode = parsedMessage.pairingCode;
					this.onPairCodeReceivedCallback?.(pairingCode);
					break;


				case "CLIENT_INFO":
					//Log the connected client's info
					this.clientId = parsedMessage.clientId;

					localStorage.setItem("clientId", parsedMessage.clientId);
					localStorage.setItem("authToken", parsedMessage.authToken);

					//Display name in App
					this.onNameReceivedCallback?.(
						parsedMessage.name,
						parsedMessage.isPrimaryTab,
					);
					break;


				case "CLIENT_NAME_CHANGED":
					//Change name for a contact in App
					this.onNameChangedCallback?.(
						parsedMessage.clientId,
						parsedMessage.name,
					);
					break;


				case "CONTACT_LIST":
					//Display connected clients in App
					this.onContactsReceivedCallback?.(parsedMessage.contacts);
					break;


				case "CLIENT_STATUS_CHANGE":
					//If a connection went offline, cancel all incoming and outgoing transfers
					if (!parsedMessage.online) {
						for (const [messageId, transfer] of this
							.incomingTransfers) {
							if (transfer.client.id == parsedMessage.clientId) {
								this.onFileFailedCallback?.(messageId);
								this.incomingTransfers.delete(messageId);
							}
						}

						for (const [messageId, targetClientId] of this
							.outgoingTransfers) {
							if (targetClientId == parsedMessage.clientId) {
								this.onFileFailedCallback?.(messageId);
								this.outgoingTransfers.delete(messageId);
							}
						}
					}

					//Change status for a client in App
					this.onClientOnlineStatusChangeCallback?.(
						parsedMessage.clientId,
						parsedMessage.online,
					);
					break;


				case "CONNECTED_CLIENT_INFO":
					//If no name or id was sent, do nothing (usually means pairing failed)
					if (parsedMessage.clientId == null) break;

					//Log connected client
					const newClient: Client = {
						id: parsedMessage.clientId,
						name: parsedMessage.clientName,
						online: true,
					};

					this.onClientConnectedCallback?.(newClient);
					break;


				case "CLIENT_REMOVED":
					//Delete all current incoming transfers
					for (const [messageId, transfer] of this
						.incomingTransfers) {
						if (transfer.client.id == parsedMessage.clientId) {
							this.incomingTransfers.delete(messageId);
						}
					}

					//Tell app to delete all UI and messages associated with the removed client
					this.onClientRemovedCallback?.(parsedMessage.clientId);

					break;


				case "PUBLIC_KEY":
					//Receive a public key, check if it is valid, and save it
					const isTrusted = await cryptoHandler.checkKey(
						parsedMessage.targetClientId,
						parsedMessage.publicKey,
					);

					if (!isTrusted) {
						console.error("Warning: Public key changed");
						return;
					}

					await cryptoHandler.importPublicKey(
						parsedMessage.publicKey,
						parsedMessage.targetClientId,
					);

					break;


				case "FILE_META":
					const incomingFile = {
						name: parsedMessage.name,
						type: parsedMessage.type,
						size: parsedMessage.size,
						chunks: [],
					};

					//Log metadata
					this.incomingTransfers.set(parsedMessage.messageId, {
						client: parsedMessage.client,
						iv: parsedMessage.iv,
						file: incomingFile,
						receivedBytes: 0,
						receivedChunks: 0,
					});

					this.onMetaReceivedCallback?.(
						parsedMessage.client,
						incomingFile,
						parsedMessage.messageId,
					);

					break;


				case "FILE_FAILED":
					this.onFileFailedCallback?.(parsedMessage.messageId);
					break;


			}
		});

		//Listen for connection close
		this.socket.addEventListener("close", () => {
			//Keep trying to reconnect
			console.log("reconnecting");
			this.connect(authToken);

			//Alert App that the server is no longer connected
			setTimeout(() => {
				if (this.socket?.readyState != WebSocket.OPEN) {
					this.onConnectionStatusChangeCallback?.(false);
				}
			}, 2000);
		});

		//Listen for connection error
		this.socket.addEventListener("error", () => {});
	}



	//Close the socket connection
	disconnect() {
		this.socket?.close();
	}



	//Request pairing code from server
	getPairingCode = () => {
		this.socket?.send(
			JSON.stringify({
				signal: "REQUEST_PAIRING_CODE",
			}),
		);
	};



	//Request name change
	editName = (name: string) => {
		this.socket?.send(
			JSON.stringify({
				signal: "CHANGE_NAME",
				name: name,
			}),
		);
	};



	//Ask server to connect with another client
	connectWithClient = (pairingCode: string) => {
		this.socket?.send(
			JSON.stringify({
				signal: "CONNECT_WITH_CLIENT",
				pairingCode: pairingCode,
			}),
		);
	};



	//Delete contact with a client
	deleteClient(clientId: string) {
		this.socket?.send(
			JSON.stringify({
				signal: "REMOVE_CLIENT",
				clientId: clientId,
			}),
		);
	}



	//Play a download sound
	playDownloadSound() {
		this.downloadSound.volume = 0.5;
		this.downloadSound.currentTime = 0;
		this.downloadSound.play().catch(() => {
			"not played";
		});
	}



	//Start the process of sending a file to the server
	async send(file: File, targetClient: Client, messageId: string) {
		if (!file || !targetClient || !this.socket || this.socket.readyState != WebSocket.OPEN) return;

		this.outgoingTransfers.set(messageId, targetClient.id);


		//Send metadata with IV
		const baseIv = cryptoHandler.getBaseIv();

		this.socket.send(
			JSON.stringify({
				signal: "FILE_META",
				iv: cryptoHandler.toBase64(baseIv),
				name: file.name,
				type: file.type,
				size: file.size,
				targetClientId: targetClient.id,
				messageId: messageId,
			}),
		);


		const encoder = new TextEncoder();
		const idBytes = encoder.encode(messageId.padEnd(36));

		let counter = 0;
		let chunkNumber = 0;

		try {
			//While there are still chunks, send them
			while (counter < file.size) {
				if (!this.outgoingTransfers.has(messageId)) {
					return;
				}

				//Get a chunk of the file, if it is the last chunk, trim it 
				const end = Math.min(counter + CHUNK_SIZE, file.size);
				const chunk = file.slice(counter, end);

				//Encrypt chunk
				const encryptedChunk = await cryptoHandler.encryptChunk(
					await chunk.arrayBuffer(),
					targetClient.id,
					baseIv,
					chunkNumber,
				);
				const encryptedBytes = new Uint8Array(encryptedChunk);

				//Construct the packet to to be sent, consisting of the data and transfer id
				const packet = new Uint8Array(
					idBytes.length + encryptedBytes.length,
				);

				packet.set(idBytes);
				packet.set(encryptedBytes, idBytes.length);

				//Don't send more than 4 chunks at a time
				while (this.socket.bufferedAmount > 4 * CHUNK_SIZE) {
					await new Promise((resolve) => setTimeout(resolve, 1));
				}

				//If socket closes mid transfer, mark as failed
				if (this.socket.readyState != WebSocket.OPEN) {
					this.onFileFailedCallback?.(messageId);
					return;
				}

				//Finally, send the packet
				this.socket.send(packet);

				//Increment counters
				counter = end;
				chunkNumber++;

				//Update progress bar UI with current progress
				this.updateProgressBarCallback?.(
					messageId,
					counter / file.size,
				);
			}

			//When transfer is done, delete the outgoingTransfer and tell App the file was sent
			this.outgoingTransfers.delete(messageId);
			this.onFileSentCallback?.(messageId);
		} catch (e) {
			//If anything fails with sending, cancel the transfer
			this.outgoingTransfers.delete(messageId);
			this.onFileFailedCallback?.(messageId);
		}
	}


	//Settings
	setAutoDownload(value: boolean) {
		this.autoDownload = value;
	}

	setSoundOnDownload(value: boolean) {
		this.soundOnDownload = value;
	}



	/*
	More callback function stuff so App can receive data
	*/
	onPairCodeReceived(callback: (code: number) => void) {
		this.onPairCodeReceivedCallback = callback;
	}

	onNameReceived(callback: (name: string, isPrimaryTab: boolean) => void) {
		this.onNameReceivedCallback = callback;
	}

	onClientConnected(callback: (client: Client) => void) {
		this.onClientConnectedCallback = callback;
	}

	onFileReceived(callback: (client: Client, file: File, messageId: string) => void) {
		this.onFileReceivedCallback = callback;
	}

	onClientRemoved(callback: (clientId: string) => void) {
		this.onClientRemovedCallback = callback;
	}

	onNameChanged(callback: (targetClientId: string, name: string) => void) {
		this.onNameChangedCallback = callback;
	}

	onContactsReceived(callback: (contacts: Client[]) => void) {
		this.onContactsReceivedCallback = callback;
	}

	onClientOnlineStatusChange(callback: (targetClientId: string, online: boolean) => void) {
		this.onClientOnlineStatusChangeCallback = callback;
	}

	onFileSent(callback: (messageId: string) => void) {
		this.onFileSentCallback = callback;
	}

	onFileFailed(callback: (messageId: string) => void) {
		this.onFileFailedCallback = callback;
	}

	onMetaReceived(callback: (client: Client, file: TemporaryFile, messageId: string) => void) {
		this.onMetaReceivedCallback = callback;
	}

	updateProgressBar(callback: (messageId: string, progress: number) => void) {
		this.updateProgressBarCallback = callback;
	}

	onConnectionStatusChange(callback: (connected: boolean) => void) {
		this.onConnectionStatusChangeCallback = callback;
	}
}

export default new SocketHandler();
