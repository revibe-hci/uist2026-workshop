import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LiveContext, LivePreview, LiveProvider } from 'react-live';
import { USES_3D, isThreeLoaded, loadThree, renderScope } from '../lib/renderScope.js';
import { SceneErrorContext } from '../lib/sceneError.js';

function ErrorReporter({ onError }) {
  const { error } = useContext(LiveContext);
  useEffect(() => {
    onError?.(error || null);
  }, [error, onError]);
  return error ? <pre className="m-render-error">{error}</pre> : null;
}

// Renders a source node's code live. data-misty-preview marks the drop surface.
export default function CodeRender({ nodeId, code, onError }) {
  const needs3D = USES_3D.test(code);
  const [threeReady, setThreeReady] = useState(isThreeLoaded());
  const [liveError, setLiveError] = useState(null);
  // A 3D error belongs to the code that produced it, so a new version starts clean.
  const [sceneError, setSceneError] = useState({ code: null, message: null });
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    if (!needs3D || isThreeLoaded()) return;
    loadThree()
      .then(() => setThreeReady(true))
      .catch((err) => setSceneError({ code: codeRef.current, message: `Could not load three.js: ${err.message}` }));
  }, [needs3D]);

  const currentSceneError = sceneError.code === code ? sceneError.message : null;
  useEffect(() => {
    onError?.(liveError || currentSceneError || null);
  }, [liveError, currentSceneError, onError]);

  const reportScene = useCallback((message) => setSceneError({ code: codeRef.current, message }), []);

  // threeReady re-runs this once three.js has loaded
  const scope = useMemo(() => renderScope(code), [code, threeReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rendered UIs are static here: keep links and forms from leaving the page.
  const stopNavigation = (event) => {
    if (event.target.closest?.('a') || event.type === 'submit') event.preventDefault();
  };

  if (needs3D && !isThreeLoaded()) {
    return (
      <div className="m-screen nodrag nowheel nopan" data-misty-preview={nodeId}>
        <div className="m-3d-loading">Loading 3D…</div>
      </div>
    );
  }

  return (
    <LiveProvider code={code} scope={scope}>
      <SceneErrorContext.Provider value={reportScene}>
        <div
          className="m-screen nodrag nowheel nopan"
          data-misty-preview={nodeId}
          onClickCapture={stopNavigation}
          onSubmitCapture={stopNavigation}
        >
          <LivePreview />
        </div>
      </SceneErrorContext.Provider>
      <ErrorReporter onError={setLiveError} />
    </LiveProvider>
  );
}
