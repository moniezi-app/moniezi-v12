#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// This is required for Capacitor to register the plugin
CAP_PLUGIN(MonieziOCRPlugin, "MonieziOCR",
    CAP_PLUGIN_METHOD(recognizeText, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(recognizeTextWithRegions, CAPPluginReturnPromise);
)
