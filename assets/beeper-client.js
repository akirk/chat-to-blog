/**
 * Beeper API Client for browser-side communication
 *
 * Makes direct requests to Beeper Desktop API (localhost:23373)
 */

class BeeperClient {
	constructor(token, apiBase = 'http://localhost:23373/v1') {
		this.token = token;
		this.apiBase = apiBase;
	}

	isConfigured() {
		return !!this.token;
	}

	async request(endpoint, options = {}) {
		if (!this.isConfigured()) {
			return { success: false, error: 'Beeper API token not configured' };
		}

		const url = this.apiBase + endpoint + (options.params ? '?' + new URLSearchParams(options.params) : '');

		try {
			const response = await fetch(url, {
				method: options.method || 'GET',
				headers: {
					'Authorization': 'Bearer ' + this.token,
					'Content-Type': 'application/json'
				},
				body: options.body ? JSON.stringify(options.body) : undefined
			});

			const data = await response.json();

			if (!response.ok) {
				return {
					success: false,
					error: data.message || 'Beeper API error',
					status: response.status
				};
			}

			return { success: true, data: data };
		} catch (error) {
			return {
				success: false,
				error: error.message || 'Failed to connect to Beeper'
			};
		}
	}

	async getAccounts() {
		return this.request('/accounts');
	}

	async getAllChats(limit = 200) {
		const result = await this.request('/chats', { params: { limit: limit } });

		if (!result.success) {
			return result;
		}

		const items = result.data.items || result.data;
		if (!Array.isArray(items)) {
			return { success: true, data: { items: [] } };
		}

		items.sort((a, b) => {
			const aTime = a.lastActivity || '';
			const bTime = b.lastActivity || '';
			return bTime.localeCompare(aTime);
		});

		return { success: true, data: { items: items } };
	}

	async getChat(chatId) {
		return this.request('/chats/' + encodeURIComponent(chatId));
	}

	async getChatMessages(chatId, cursor = null, direction = 'before') {
		const params = {};
		if (cursor) {
			params.cursor = cursor;
			params.direction = direction;
		}

		return this.request('/chats/' + encodeURIComponent(chatId) + '/messages', { params: params });
	}

	async getMediaMessages(chatId, cursor = null) {
		const mediaItems = [];
		let currentCursor = cursor;
		let hasMore = true;
		let batchCount = 0;
		const maxBatches = 5;
		let totalMessages = 0;
		const skippedTypes = {};

		while (hasMore && batchCount < maxBatches) {
			batchCount++;
			const result = await this.getChatMessages(chatId, currentCursor, 'before');

			console.log('[CTB Debug] Batch', batchCount, '- cursor:', currentCursor, 'result:', result);

			if (!result.success) {
				return result;
			}

			const items = result.data.items || [];
			totalMessages += items.length;
			console.log('[CTB Debug] Got', items.length, 'messages');

			for (const msg of items) {
				const attachments = msg.attachments || [];
				if (attachments.length === 0) {
					if (msg.text) {
						skippedTypes['text'] = (skippedTypes['text'] || 0) + 1;
					} else {
						skippedTypes['empty'] = (skippedTypes['empty'] || 0) + 1;
					}
					continue;
				}
				for (const att of attachments) {
					console.log('[CTB Debug] Attachment:', att.type, att.id);
					if (att.type === 'img' || att.type === 'video') {
						mediaItems.push({
							id: att.id,
							mxcUrl: att.id,
							timestamp: msg.timestamp,
							text: msg.text || '',
							sender: msg.senderName || (msg.isSender ? 'You' : 'Unknown'),
							mimeType: att.mimeType,
							fileName: att.fileName,
							sortKey: msg.sortKey
						});
					} else {
						skippedTypes[att.type] = (skippedTypes[att.type] || 0) + 1;
					}
				}
			}

			const lastItem = items[items.length - 1];
			currentCursor = lastItem ? lastItem.sortKey : null;
			hasMore = result.data.hasMore || false;

			console.log('[CTB Debug] Found', mediaItems.length, 'media so far, hasMore:', hasMore);

			if (mediaItems.length > 0) {
				break;
			}
		}

		return {
			success: true,
			data: {
				items: mediaItems,
				hasMore: hasMore,
				nextCursor: currentCursor,
				stats: {
					totalMessages: totalMessages,
					mediaCount: mediaItems.length,
					skippedTypes: skippedTypes
				}
			}
		};
	}

	async testConnection() {
		const result = await this.getAccounts();

		if (!result.success) {
			return result;
		}

		const accounts = result.data;
		return {
			success: true,
			data: {
				accounts: accounts.length,
				networks: [...new Set(accounts.map(a => a.network))]
			}
		};
	}
}

window.BeeperClient = BeeperClient;
