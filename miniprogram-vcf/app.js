App({
  globalData: {
    storageKey: 'vcf_contacts_v1'
  },
  onLaunch: function () {
    // 版本更新提示（真机生效）
    if (wx.canIUse && wx.canIUse('getUpdateManager')) {
      var um = wx.getUpdateManager();
      um.onUpdateReady(function () {
        wx.showModal({
          title: '更新提示',
          content: '新版本已经准备好，是否重启应用？',
          success: function (res) { if (res.confirm) um.applyUpdate(); }
        });
      });
    }
  }
});
