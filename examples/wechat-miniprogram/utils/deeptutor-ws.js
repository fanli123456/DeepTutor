function buildWsUrl(baseUrl, token) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/ws`
  if (!token) return url
  return `${url}?token=${encodeURIComponent(token)}`
}

function normalizeContent(event) {
  if (!event) return ''
  if (typeof event.content === 'string') return event.content
  if (event.metadata && typeof event.metadata.content === 'string') return event.metadata.content
  if (event.metadata && typeof event.metadata.response === 'string') return event.metadata.response
  return ''
}

class DeepTutorSocket {
  constructor(options) {
    this.baseUrl = options.baseUrl
    this.token = options.token || ''
    this.sessionId = options.sessionId
    this.language = options.language || 'zh-CN'
    this.capability = options.capability || 'chat'
    this.tools = options.tools || []
    this.knowledgeBases = options.knowledgeBases || []
    this.onOpen = options.onOpen || function noop() {}
    this.onMessage = options.onMessage || function noop() {}
    this.onError = options.onError || function noop() {}
    this.onClose = options.onClose || function noop() {}
    this.socketTask = null
    this.connected = false
    this.pendingPayloads = []
  }

  connect() {
    if (this.socketTask) return this.socketTask

    this.socketTask = wx.connectSocket({
      url: buildWsUrl(this.baseUrl, this.token),
      success: () => {}
    })

    this.socketTask.onOpen(() => {
      this.connected = true
      this.flushPendingPayloads()
      this.onOpen()
    })

    this.socketTask.onMessage((packet) => {
      let event = null
      try {
        event = JSON.parse(packet.data)
      } catch (error) {
        this.onError({ message: 'DeepTutor 返回了非 JSON 消息', detail: packet.data })
        return
      }
      this.onMessage(event, normalizeContent(event))
    })

    this.socketTask.onError((error) => {
      this.connected = false
      this.onError(error)
    })

    this.socketTask.onClose((event) => {
      this.connected = false
      this.socketTask = null
      this.onClose(event)
    })

    return this.socketTask
  }

  sendMessage(content, extraPayload) {
    const text = String(content || '').trim()
    if (!text) return false
    this.connect()

    const payload = Object.assign({
      type: 'message',
      session_id: this.sessionId,
      content: text,
      capability: this.capability,
      tools: this.tools,
      knowledge_bases: this.knowledgeBases,
      language: this.language,
      config: {}
    }, extraPayload || {})

    if (!this.connected) {
      this.pendingPayloads.push(payload)
      return true
    }

    this.sendPayload(payload)
    return true
  }

  sendPayload(payload) {
    if (!this.socketTask) return
    this.socketTask.send({
      data: JSON.stringify(payload),
      fail: (error) => this.onError(error)
    })
  }

  flushPendingPayloads() {
    const payloads = this.pendingPayloads.splice(0)
    payloads.forEach((payload) => this.sendPayload(payload))
  }

  close() {
    if (!this.socketTask) return
    this.socketTask.close({ code: 1000, reason: 'page closed' })
    this.socketTask = null
    this.connected = false
  }
}

module.exports = {
  DeepTutorSocket,
  buildWsUrl,
  normalizeContent
}
