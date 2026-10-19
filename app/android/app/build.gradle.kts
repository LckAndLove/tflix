plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.nunesnetwork.tflix"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.nunesnetwork.tflix"
        minSdk = 21
        targetSdk = 35
        // App version: bump BOTH on every release — versionName is what users
        // see; versionCode must strictly increase for Android to accept an update.
        versionCode = 3
        versionName = "1.3.0"
    }

    val keystoreFile = file("release.p12")
    val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")?.trim()
    val keyAliasEnv = System.getenv("ANDROID_KEY_ALIAS")?.trim()
    val keyPasswordEnv = System.getenv("ANDROID_KEY_PASSWORD")?.trim()

    signingConfigs {
        create("release") {
            if (keystoreFile.exists() && !keystorePassword.isNullOrEmpty()) {
                storeFile = keystoreFile
                storeType = "PKCS12"
                storePassword = keystorePassword
                keyAlias = if (!keyAliasEnv.isNullOrEmpty()) keyAliasEnv else "tflix"
                keyPassword = if (!keyPasswordEnv.isNullOrEmpty()) keyPasswordEnv else keystorePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    // Name the APKs like the Windows installer artifacts:
    //   release → tflix-android.<version>.apk
    //   debug   → tflix-android.debug.<version>.apk
    applicationVariants.all {
        outputs.all {
            val suffix = if (buildType.name == "debug") "debug.$versionName" else versionName
            (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
                "tflix-android.$suffix.apk"
        }
    }
}

// ─── Strict Release Validation ───
// Release builds MUST be signed with the official release key; never silently fall back to debug.
gradle.taskGraph.whenReady {
    val isReleaseRequested = allTasks.any {
        it.name.contains("Release", ignoreCase = true) && !it.name.contains("Lint", ignoreCase = true)
    }
    if (isReleaseRequested) {
        val keystoreFile = file("release.p12")
        val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")?.trim()
        if (!keystoreFile.exists()) {
            throw GradleException(
                "Release build failed: 'release.p12' not found. " +
                "Official release builds must be signed with release keystore. " +
                "For local testing without release keys, run './gradlew assembleDebug' instead."
            )
        }
        if (keystorePassword.isNullOrEmpty()) {
            throw GradleException(
                "Release build failed: ANDROID_KEYSTORE_PASSWORD environment variable is missing or empty. " +
                "For local testing without release keys, run './gradlew assembleDebug' instead."
            )
        }
    }
}

// ─── Task: Automatic Web Asset Preparation into Android Assets ───
val repoRoot = rootDir.parentFile?.parentFile ?: file("../../")
val prepareScript = File(repoRoot, "scripts/prepare-ui.mjs")

val prepareWebAssets = tasks.register<Exec>("prepareWebAssets") {
    group = "build"
    description = "Prepares and injects web assets with TMDB credentials into Android assets"
    workingDir = repoRoot
    if (!prepareScript.exists()) {
        throw GradleException("Required UI preparation script not found: ${prepareScript.absolutePath}")
    }
    val isWindows = System.getProperty("os.name")?.lowercase()?.contains("windows") == true
    if (isWindows) {
        commandLine("cmd", "/c", "node", prepareScript.absolutePath)
    } else {
        commandLine("node", prepareScript.absolutePath)
    }
    // Fail immediately if node script exits with non-zero status
    isIgnoreExitValue = false
}

tasks.named("preBuild").configure {
    dependsOn(prepareWebAssets)
}
