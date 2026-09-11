import { useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";
import { Message, Conversation, Client, TemporaryFile } from "./types/types";
import socketHandler from "./handlers/SocketHandler";
import fileStorageHandler from "./handlers/FileStorageHandler";
import cryptoHandler from "./handlers/CryptoHandler";
import { useSettings } from "./context/SettingsContext";
import DropOverlay from "./components/DropOverlay";
import "./App.css";

const App = () => {
	type MobileScreen = "sidebar" | "main";
	const [mobileScreen, setMobileScreen] = useState<MobileScreen>("sidebar");

	//List of connected clients, stored as name and id
	const [clients, setClients] = useState<Client[]>(() => {
		const saved = localStorage.getItem("contacts");

		if (!saved) return [];

		try {
			return JSON.parse(saved);
		} catch {
			return [];
		}
	});

	//Keep track of the client that is currently being viewed
	const [selectedClient, setSelectedClient] = useState<Client>({
		id: "",
		name: "",
		online: false,
	});

	const [serverConnected, setServerConnected] = useState<boolean | null>(
		null,
	);

	//For the MainContent component to decide whether to show the pairing menu or not
	const [activePanel, setActivePanel] = useState<
		"none" | "pairing" | "settings" | "contact"
	>("none");

	//Hold all conversations, storing id and messages
	const [conversations, setConversations] = useState<Conversation[]>(() => {
		//Load in converstaions from local storage if it has them
		const saved = localStorage.getItem("conversations");

		if (!saved) return [];

		try {
			return JSON.parse(saved);
		} catch {
			return [];
		}
	});
	let isRemoteUpdate = useRef(false);

	//Pairing code from websocket server
	const [pairingCode, setPairingCode] = useState(0);
	const [name, setName] = useState(localStorage.getItem("displayName") ?? "");

	const [dragging, setDragging] = useState(false);

	const { autoDownload, soundOnDownload, saveFiles } = useSettings();

	//Add a new message to a conversation, creating one if there is not already
	const addMessage = (client: Client, message: Message) => {
		setConversations((prev) => {
			//Check if a conversation for the client already exists
			const conversationExists = prev.some(
				(conversation) => conversation.client.id == client.id,
			);

			//If no conversation exists (new client), create a new one
			if (!conversationExists) {
				return [...prev, { client, messages: [message] }];
			}

			return prev.map((conversation) => {
				//Add message to conversation and return that concatenated message array
				if (conversation.client.id == client.id) {
					return {
						client: conversation.client,
						messages: [...conversation.messages, message],
					};
				}

				//If the client isnt there, return the original array
				return conversation;
			});
		});
	};

	//Get all messages with the selected client
	const getMessages = () => {
		//Find the selected client's conversation
		const conversation = conversations.find(
			(conversation) => conversation.client.id == selectedClient.id,
		);

		return conversation ? conversation.messages : [];
	};

	const clearMessageHistory = async (forgetDevices: boolean) => {
		//Go through every message, removing the associated saved file in the database

		for (const conversation of conversations) {
			for (const message of conversation.messages) {
				await fileStorageHandler.deleteFile(message.id);
			}
		}

		//If the forgetDevices flag is checked, remove all conversations and clients
		if (forgetDevices) {
			for (const client of clients) {
				socketHandler.deleteClient(client.id);
			}

			setSelectedClient({
				id: "",
				name: "",
				online: false,
			});

			setConversations([]);
			setClients([]);
		} else {
			//Go through every conversation and remove the messages in local storage
			setConversations((prev) =>
				prev.map((conversation) => ({
					...conversation,
					messages: [],
				})),
			);
		}
	};

	//Build message contents to be displayed
	const buildMessage = (file: File, timestamp: number, client?: Client) => {
		const msg: Message = {
			id: crypto.randomUUID(),
			sender: client,
			filename: file.name,
			filesize: file.size,
			downloadUrl: URL.createObjectURL(file),
			timestamp: new Date(timestamp).toLocaleString(),
			status: "sent",
		};

		return msg;
	};

	const buildTemporaryMessage = (
		file: TemporaryFile,
		client?: Client,
		messageId?: string,
		downloadUrl?: string,
	) => {
		const msg: Message = {
			id: messageId ?? crypto.randomUUID(),
			sender: client,
			filename: file.name,
			filesize: file.size,
			timestamp: "",
			status: "sending",
			...(downloadUrl != undefined && { downloadUrl }),
		};

		return msg;
	};

	const editMessage = (
		id: string,
		sender?: Client,
		filename?: string,
		downloadUrl?: string,
		timestamp?: string,
		status?: "sending" | "sent" | "failed",
		progress?: number,
	) => {
		setConversations((prev) =>
			prev.map((conversation) => ({
				...conversation,
				messages: conversation.messages.map((message) => {
					if (message.id != id) return message;

					return {
						...message,
						...(sender != undefined && { sender }),
						...(filename != undefined && { filename }),
						...(downloadUrl != undefined && { downloadUrl }),
						...(timestamp != undefined && {
							timestamp: timestamp,
						}),
						...(status != undefined && { status }),
						...(progress != undefined && { progress }),
					};
				}),
			})),
		);
	};

	//Triggered when user wants to change their name
	const editName = (name: string) => {
		socketHandler.editName(name);
		setName(name);
	};

	/*
	Give each message a download link for its saved file, if the file exists
	Triggers when the client first connects and whenever a new message is saved to the database
	*/
	const rebuildConversations = async (conversations: Conversation[]) => {
		//Loop through every message in every conversation
		return Promise.all(
			conversations.map(async (conversation) => ({
				...conversation,
				messages: await Promise.all(
					conversation.messages.map(async (message) => {
						//Check if there is a saved file in the database
						const file = await fileStorageHandler.getFile(
							message.id,
						);

						if (!file) return message;

						//Create a download link for the file
						return {
							...message,
							downloadUrl: URL.createObjectURL(file),
						};
					}),
				),
			})),
		);
	};

	const markIncompleteMessagesAsFailed = (conversations: Conversation[]) => {
		return conversations.map((conversation) => ({
			...conversation,
			messages: conversation.messages.map((message) => {
				if (message.status == "sending") {
					return {
						...message,
						status: "failed" as const,
					};
				}

				return message;
			}),
		}));
	};

	const deleteClient = async (client: Client) => {
		const conversation = conversations.find(
			(c) => c.client.id === client.id,
		);

		if (conversation) {
			for (const message of conversation.messages) {
				await fileStorageHandler.deleteFile(message.id);
			}
		}

		setConversations((prev) =>
			prev.filter((conversation) => conversation.client.id != client.id),
		);

		setClients((prev) => prev.filter((c) => c.id !== client.id));

		if (selectedClient.id == client.id) {
			setSelectedClient({ id: "", name: "", online: false });
		}

		socketHandler.deleteClient(client.id);
	};

	const handleFileUpload = async (file: File) => {
		const message = buildTemporaryMessage(
			{
				name: file.name,
				type: file.type,
				size: file.size,
				chunks: [],
			},
			undefined,
			undefined,
			URL.createObjectURL(file),
		);

		if (saveFiles) {
			await fileStorageHandler.addFile(message.id, file);
		}

		addMessage(selectedClient, message);

		await socketHandler.send(file, selectedClient, message.id);
	};

	//Update local storage when a new contact is added
	useEffect(() => {
		localStorage.setItem("contacts", JSON.stringify(clients));

		for (const client of clients) {
			if (client.id == selectedClient.id) {
				setSelectedClient(client);
			}
		}
	}, [clients]);

	//Update local storage when a new message or conversation is added
	useEffect(() => {
		//Ensures the update doesn't infinitely loop
		if (isRemoteUpdate.current) {
			isRemoteUpdate.current = false;
			return;
		}

		const modifiedConversations = conversations.map((conversation) => ({
			...conversation,
			messages: conversation.messages.map((message) => ({
				id: message.id,
				sender: message.sender,
				filename: message.filename,
				filesize: message.filesize,
				timestamp: message.timestamp,
				status: message.status,
				progress: message.progress,
			})),
		}));

		localStorage.setItem(
			"conversations",
			JSON.stringify(modifiedConversations),
		);
	}, [conversations]);

	//Update local storage when name is changed
	useEffect(() => {
		localStorage.setItem("displayName", name);
	}, [name]);

	useEffect(() => {
		const onDragEnter = (e: DragEvent) => {
			if (activePanel != "contact") return;

			e.preventDefault();

			if (e.dataTransfer?.types.includes("Files")) {
				setDragging(true);
			}
		};

		const onDragOver = (e: DragEvent) => {
			if (activePanel != "contact") return;

			e.preventDefault();
		};

		const onDragLeave = (e: DragEvent) => {
			if (activePanel != "contact") return;

			e.preventDefault();

			if (
				e.clientX <= 0 ||
				e.clientY <= 0 ||
				e.clientX >= window.innerWidth ||
				e.clientY >= window.innerHeight
			) {
				setDragging(false);
			}
		};

		const onDrop = async (e: DragEvent) => {
			if (activePanel != "contact") return;

			e.preventDefault();
			setDragging(false);

			const files = Array.from(e.dataTransfer?.files ?? []);
			for (const file of files) {
				await handleFileUpload(file);
			}
		};

		window.addEventListener("dragenter", onDragEnter);
		window.addEventListener("dragover", onDragOver);
		window.addEventListener("dragleave", onDragLeave);
		window.addEventListener("drop", onDrop);

		return () => {
			window.removeEventListener("dragenter", onDragEnter);
			window.removeEventListener("dragover", onDragOver);
			window.removeEventListener("dragleave", onDragLeave);
			window.removeEventListener("drop", onDrop);
		};
	}, [activePanel]);

	//Update document title when selectedClient is changed
	useEffect(() => {
		document.title = selectedClient.name
			? `File sharing with: ${selectedClient.name}`
			: "File sharing";
	}, [selectedClient.name]);

	//On program start, initialize the databases and assign links for files if necessary
	useEffect(() => {
		const init = async () => {
			await fileStorageHandler.connect();
			await cryptoHandler.initialize();

			const rebuilt = await rebuildConversations(conversations);
			setConversations(markIncompleteMessagesAsFailed(rebuilt));
		};

		init();
	}, []);

	//When local storage changes, do different things based on what changed
	useEffect(() => {
		const handleStorage = async (e: StorageEvent) => {
			//If displayName is edited, change the UI to reflect that
			if (e.key == "displayName") {
				setName(e.newValue ?? "");
			}

			//If conversations is edited, rebuild the file links again
			if (e.key == "conversations") {
				try {
					const stored = e.newValue ? JSON.parse(e.newValue) : [];

					const rebuilt = await rebuildConversations(stored);
					isRemoteUpdate.current = true;
					setConversations(rebuilt);
				} catch {
					setConversations([]);
				}
			}
		};

		window.addEventListener("storage", handleStorage);

		return () => {
			window.removeEventListener("storage", handleStorage);
		};
	}, []);

	//This useEffect handles interfacing with the WebSocket (intializes on program start)
	useEffect(() => {
		//Generate a new id for this client if there isnt one saved in local storage

		//Initialize WS connection
		const authToken = localStorage.getItem("authToken");
		socketHandler.connect(authToken);

		/*
		These are a bunch of functions for changing UI based on incoming data from the server
		*/
		socketHandler.onPairCodeReceived((code: number) => {
			setPairingCode(code);
		});

		socketHandler.onNameReceived((name: string) => {
			setName(name);
		});

		socketHandler.onClientConnected((client: Client) => {
			setClients((prev) => {
				if (prev.some((c) => c.id == client.id)) {
					return prev;
				}

				return [...prev, client];
			});

			setActivePanel("none");
		});

		socketHandler.onMetaReceived(
			(client: Client, file: TemporaryFile, messageId: string) => {
				const message = buildTemporaryMessage(file, client, messageId);

				addMessage(client, message);
			},
		);

		socketHandler.onFileReceived(
			async (client: Client, file: File, messageId: string) => {
				//Upload to database
				if (saveFiles) {
					await fileStorageHandler.addFile(messageId, file);
				}

				//Add file to the specified client
				editMessage(
					messageId,
					client,
					file.name,
					URL.createObjectURL(file),
					new Date().toLocaleString(),
					"sent",
				);
			},
		);

		socketHandler.onClientRemoved((clientId: string) => {
			setConversations((prev) =>
				prev.filter(
					(conversation) => conversation.client.id != clientId,
				),
			);

			setClients((prev) => prev.filter((c) => c.id !== clientId));

			if (selectedClient.id == clientId) {
				setSelectedClient({ id: "", name: "", online: false });
			}
		});

		socketHandler.onNameChanged((targetClientId: string, name: string) => {
			setClients((prev) =>
				prev.map((client) =>
					client.id == targetClientId ? { ...client, name } : client,
				),
			);
		});

		socketHandler.onContactsReceived((contacts: Client[]) => {
			setClients(contacts);
			// setClients([...contacts, ...testClients]);
		});

		socketHandler.onClientOnlineStatusChange(
			//Change status of the specified client
			(targetClientId: string, online: boolean) => {
				setClients((prev) =>
					prev.map((client) =>
						client.id == targetClientId
							? { ...client, online }
							: client,
					),
				);
			},
		);

		socketHandler.onFileSent((messageId: string) => {
			editMessage(
				messageId,
				undefined,
				undefined,
				undefined,
				new Date().toLocaleString(),
				"sent",
				1,
			);
		});

		socketHandler.onFileFailed((messageId: string) => {
			editMessage(
				messageId,
				undefined,
				undefined,
				undefined,
				undefined,
				"failed",
				0,
			);
		});

		socketHandler.updateProgressBar(
			(messageId: string, progress: number) => {
				editMessage(
					messageId,
					undefined,
					undefined,
					undefined,
					undefined,
					"sending",
					progress,
				);
			},
		);

		socketHandler.onConnectionStatusChange((connected) => {
			setServerConnected(connected);
		});

		return () => {
			socketHandler.disconnect();
		};
	}, []);

	useEffect(() => {
		socketHandler.setAutoDownload(autoDownload);
	}, [autoDownload]);

	useEffect(() => {
		socketHandler.setSoundOnDownload(soundOnDownload);
	}, [soundOnDownload]);

	// const testClients: Client[] = [
	// 	{ id: "1", name: "Beautiful Starling", online: true },
	// 	{ id: "2", name: "Swift Otter", online: false },
	// 	// { id: "3", name: "Silent Falcon", online: true },
	// 	// { id: "4", name: "Lucky Turtle", online: false },
	// 	// { id: "5", name: "Brave Fox", online: true },
	// 	// { id: "6", name: "Beautiful Starling", online: true },
	// 	// { id: "7", name: "Swift Otter", online: false },
	// 	// { id: "8", name: "Silent Falcon", online: true },
	// 	// { id: "9", name: "Lucky Turtle", online: false },
	// 	// { id: "10", name: "Brave Fox", online: true },
	// 	// { id: "11", name: "Beautiful Starling", online: true },
	// 	// { id: "12", name: "Swift Otter", online: false },
	// 	// { id: "13", name: "Silent Falcon", online: true },
	// 	// { id: "14", name: "Lucky Turtle", online: false },
	// 	// { id: "15", name: "Brave Fox", online: true },
	// 	// { id: "16", name: "Beautiful Starling", online: true },
	// 	// { id: "17", name: "Swift Otter", online: false },
	// 	// { id: "18", name: "Silent Falcon", online: true },
	// 	// { id: "19", name: "Lucky Turtle", online: false },
	// 	// { id: "20", name: "Brave Fox", online: true },
	// 	// { id: "21", name: "Beautiful Starling", online: true },
	// 	// { id: "22", name: "Swift Otter", online: false },
	// 	// { id: "23", name: "Silent Falcon", online: true },
	// 	// { id: "24", name: "Lucky Turtle", online: false },
	// 	// { id: "25", name: "Brave Fox", online: true },
	// 	// { id: "26", name: "Beautiful Starling", online: true },
	// 	// { id: "27", name: "Swift Otter", online: false },
	// 	// { id: "28", name: "Silent Falcon", online: true },
	// 	// { id: "29", name: "Lucky Turtle", online: false },
	// 	// { id: "30", name: "Brave Fox", online: true },
	// ];

	return (
		<div>
			{serverConnected == false ? (
				<div className="vh-100 vw-100 p-3 d-flex flex-column align-items-center justify-content-center">
					<h1>Server unavailable</h1>

					<h5 className="mt-3 lh-base text-center">
						Couldn't connect to the server.
						<br />
						Make sure it's running and refresh this page.
					</h5>
				</div>
			) : (
				<>
					{/* DESKTOP LAYOUT */}
					<div className="desktop-layout">
						{dragging && selectedClient.id != "" && <DropOverlay />}
						<Sidebar
							clients={clients}
							name={name}
							editName={editName}
							onSelectClient={(client) => {
								setSelectedClient(client);
								setActivePanel("contact");
							}}
							togglePairing={() => {
								setSelectedClient({
									name: "",
									id: "",
									online: false,
								});
								setActivePanel("pairing");
							}}
							toggleSettings={() => {
								setSelectedClient({
									name: "",
									id: "",
									online: false,
								});
								setActivePanel("settings");
							}}
							deleteClient={deleteClient}
						/>

						<MainContent
							activePanel={activePanel}
							pairingCode={pairingCode}
							generatePairingCode={socketHandler.getPairingCode}
							connectWithClient={socketHandler.connectWithClient}
							onFileSelect={async (file) => {
								await handleFileUpload(file);
							}}
							messages={getMessages()}
							isOnline={selectedClient.online}
							clearMessageHistory={clearMessageHistory}
							isMobileUI={false}
						/>
					</div>

					{/* MOBILE LAYOUT */}
					<div className="mobile-layout">
						{mobileScreen == "sidebar" && (
							<Sidebar
								clients={clients}
								name={name}
								editName={editName}
								onSelectClient={(client) => {
									setSelectedClient(client);
									setActivePanel("contact");
									setMobileScreen("main");
								}}
								togglePairing={() => {
									setSelectedClient({
										name: "",
										id: "",
										online: false,
									});
									setActivePanel("pairing");
									setMobileScreen("main");
								}}
								toggleSettings={() => {
									setSelectedClient({
										name: "",
										id: "",
										online: false,
									});
									setActivePanel("settings");
									setMobileScreen("main");
								}}
								deleteClient={deleteClient}
								isMobileUI={true}
							/>
						)}

						{mobileScreen == "main" && (
							<MainContent
								activePanel={activePanel}
								pairingCode={pairingCode}
								generatePairingCode={
									socketHandler.getPairingCode
								}
								connectWithClient={
									socketHandler.connectWithClient
								}
								onFileSelect={async (file) => {
									await handleFileUpload(file);
								}}
								messages={getMessages()}
								isOnline={selectedClient.online}
								clearMessageHistory={clearMessageHistory}
								isMobileUI={true}
								selectedClient={selectedClient}
								onMobileBackButton={() =>
									setMobileScreen("sidebar")
								}
							/>
						)}
					</div>
				</>
			)}
		</div>
	);
};

export default App;
