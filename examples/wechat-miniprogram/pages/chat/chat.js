const { DeepTutorSocket } = require('../../utils/deeptutor-ws')

const app = getApp()

function createMessage(role, content) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content
  }
}

Page({
  data: {
    inputValue: '',
    messages: [
      createMessage('assistant', '你好，我是 DeepTutor。你可以问我学习问题，也可以让我一步步讲解题目。')
    ],
    sending: false,
    statusText: '',
    scrollIntoView: ''
  },

  onLoad() {
    const config = app.globalData
    this.assistantMessageId = ''
    this.client = new DeepTutorSocket({
      baseUrl: config.wsBaseUrl,
      token: config.token,
      sessionId: config.sessionId,
      language: 'zh-CN',
      capability: 'chat',
      onOpen: () => this.setData({ statusText: '' }),
      onMessage: (event, text) => this.handleDeepTutorEvent(event, text),
      onError: (error) => {
        console.error('DeepTutor socket error', error)
        this.setData({ sending: false, statusText: '连接失败，请检查后端服务和小程序 socket 合法域名。' })
      },
      onClose: () => {
        if (this.data.sending) {
          this.setData({ sending: false, statusText: '连接已断开，请重试。' })
        }
      }
    })
    this.client.connect()
  },

  onUnload() {
    if (this.client) this.client.close()
  },

  onInput(event) {
    this.setData({ inputValue: event.detail.value })
  },

  sendMessage() {
    const content = this.data.inputValue.trim()
    if (!content || this.data.sending) return

    const userMessage = createMessage('user', content)
    const assistantMessage = createMessage('assistant', '')
    this.assistantMessageId = assistantMessage.id

    this.setData({
      inputValue: '',
      sending: true,
      statusText: 'DeepTutor 正在思考...',
      messages: this.data.messages.concat(userMessage, assistantMessage)
    }, this.scrollToBottom)

    this.client.sendMessage(content)
  },

  handleDeepTutorEvent(event, text) {
    if (event.type === 'error') {
      this.updateAssistantText(text || event.message || '服务端返回错误。')
      this.setData({ sending: false, statusText: '' })
      return
    }

    if (['stage_start', 'stage_end', 'thinking', 'progress', 'observation', 'tool_call', 'tool_result'].includes(event.type)) {
      this.setData({ statusText: text || event.stage || '处理中...' })
      return
    }

    if (event.type === 'content' && text) {
      this.updateAssistantText(text)
      return
    }

    if (event.type === 'result' || event.type === 'done') {
      const response = text || (event.metadata && event.metadata.response) || ''
      if (response && !this.currentAssistantContent()) {
        this.updateAssistantText(response)
      }
      this.setData({ sending: false, statusText: '' })
      return
    }

    if (event.metadata && event.metadata.turn_terminal) {
      this.setData({ sending: false, statusText: '' })
    }
  },

  updateAssistantText(delta) {
    const messages = this.data.messages.map((message) => {
      if (message.id !== this.assistantMessageId) return message
      return Object.assign({}, message, { content: `${message.content}${delta}` })
    })
    this.setData({ messages, statusText: '' }, this.scrollToBottom)
  },

  currentAssistantContent() {
    const message = this.data.messages.find((item) => item.id === this.assistantMessageId)
    return message ? message.content : ''
  },

  scrollToBottom() {
    const last = this.data.messages[this.data.messages.length - 1]
    if (last) this.setData({ scrollIntoView: `msg-${last.id}` })
  }
})
