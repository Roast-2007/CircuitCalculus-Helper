import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { MARKDOWN_DOCUMENT_CSS } from "../constants/markdownStyles";
import { renderMarkdownHtml } from "../services/markdownRender";
import { theme } from "../theme";

function generateHtml(content: string): string {
  const renderedHtml = renderMarkdownHtml(content);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>${MARKDOWN_DOCUMENT_CSS}</style>
</head>
<body>
  <div id="content">${renderedHtml}</div>
  <script>
    (function() {
      var contentDiv = document.getElementById('content');

      function reportHeight() {
        var h = document.documentElement.scrollHeight;
        window.ReactNativeWebView.postMessage(JSON.stringify({ height: h }));
      }

      setTimeout(reportHeight, 30);
      setTimeout(reportHeight, 120);
      setTimeout(reportHeight, 400);
      setTimeout(reportHeight, 1200);

      if (window.MutationObserver) {
        var observer = new MutationObserver(function() {
          reportHeight();
        });
        observer.observe(contentDiv, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true
        });
      }
    })();
  </script>
</body>
</html>`;
}

type Props = {
  content: string;
};

export default function MarkdownView({ content }: Props) {
  const [webViewHeight, setWebViewHeight] = useState(100);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [debouncedContent, setDebouncedContent] = useState(content);
  const contentLengthRef = useRef(content.length);

  useEffect(() => {
    const nextLength = content.length;
    const delay = nextLength > contentLengthRef.current ? 120 : 0;
    contentLengthRef.current = nextLength;
    const timer = setTimeout(() => setDebouncedContent(content), delay);
    return () => clearTimeout(timer);
  }, [content]);

  const html = useMemo(() => generateHtml(debouncedContent), [debouncedContent]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (typeof data.height === "number" && data.height > 0) {
        setWebViewHeight((current) => Math.max(current, data.height));
      }
    } catch {
      // ignore malformed postMessage payloads
    }
  }, []);

  useEffect(() => {
    setWebViewHeight(100);
    setWebViewLoading(true);
  }, [html]);

  return (
    <View style={[styles.container, { height: Math.max(100, webViewHeight + 16) }]}>
      <WebView
        source={{ html }}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        style={styles.webview}
        originWhitelist={["about:blank"]}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        scalesPageToFit={false}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        androidLayerType="hardware"
        overScrollMode="never"
        onLoadStart={() => setWebViewLoading(true)}
        onLoadEnd={() => setWebViewLoading(false)}
      />
      {webViewLoading && (
        <View style={styles.webviewLoadingOverlay}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: 100,
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  webviewLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
});
