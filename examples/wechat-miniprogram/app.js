App({
  globalData: {
    // TODO: 改成你的后端域名。正式版必须是 HTTPS/WSS，并已在微信公众平台配置合法域名。
    apiBaseUrl: 'https://api.example.com',
    wsBaseUrl: 'wss://api.example.com',

    // 开启 DeepTutor 鉴权时填写后端下发的短期 token；关闭鉴权时留空即可。
    token: '',

    // 小程序本地演示会话。生产环境建议由 openid + conversationId 生成。
    sessionId: 'wechat-demo-session'
  }
})
