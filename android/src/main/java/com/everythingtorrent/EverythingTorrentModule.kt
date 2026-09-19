package com.everythingtorrent

import com.facebook.react.bridge.ReactApplicationContext

class EverythingTorrentModule(reactContext: ReactApplicationContext) :
  NativeEverythingTorrentSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeEverythingTorrentSpec.NAME
  }
}
