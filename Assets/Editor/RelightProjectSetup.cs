using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Relight.Editor
{
    public static class RelightProjectSetup
    {
        private const string ScenePath = "Assets/Scenes/Relight.unity";

        [MenuItem("Relight/Initialize Playable Scene")]
        public static void Initialize()
        {
            if (!AssetDatabase.IsValidFolder("Assets/Scenes"))
                AssetDatabase.CreateFolder("Assets", "Scenes");

            if (!File.Exists(ScenePath))
            {
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
            }

            EditorBuildSettings.scenes = new [] { new EditorBuildSettingsScene(ScenePath, true) };
            PlayerSettings.productName = "Relight";
            PlayerSettings.companyName = "Relight Studio";
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            AssetDatabase.SaveAssets();
            Debug.Log("Relight scene created and registered. Open Assets/Scenes/Relight.unity and press Play.");
        }

        [MenuItem("Relight/Build Android Development APK")]
        public static void BuildAndroid()
        {
            Initialize();
            Directory.CreateDirectory("Builds");
            EditorUserBuildSettings.buildAppBundle = false;
            var result = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new [] { ScenePath },
                locationPathName = "Builds/Relight-dev.apk",
                target = BuildTarget.Android,
                options = BuildOptions.Development | BuildOptions.AllowDebugging
            });
            if (result.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new System.Exception("Android build failed: " + result.summary.result);
            Debug.Log("Android development APK created at Builds/Relight-dev.apk");
        }
    }
}
