// android/src/main/java/com/everythingtorrent/Session.kt
package com.everythingtorrent

import org.libtorrent4j.SessionManager
import org.libtorrent4j.SessionParams
import org.libtorrent4j.SettingsPack
import org.libtorrent4j.swig.settings_pack

object Session {
    private val manager = SessionManager()

    fun start() {
        if (manager.isRunning) return

        val sp = SettingsPack()
        sp.swig().set_int(
            settings_pack.int_types.alert_queue_size.swigValue(),
            5000
        )
        sp.swig().set_bool(
            settings_pack.bool_types.enable_ip_notifier.swigValue(),
            false
        )
        sp.swig().set_bool(
            settings_pack.bool_types.announce_to_all_trackers.swigValue(),
            true
        )
        sp.swig().set_bool(
            settings_pack.bool_types.announce_to_all_tiers.swigValue(),
            true
        )

        val params = SessionParams(sp)
        manager.start(params)
    }

    fun stop() {
        if (manager.isRunning) manager.stop()
    }

    fun isRunning(): Boolean = manager.isRunning

    fun get(): SessionManager = manager
}