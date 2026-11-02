import React, { useContext, useEffect, useMemo, useRef } from 'react';
import { LiveContext, LivePreview, LiveProvider } from 'react-live';
import { iconScope } from '../lib/icons.js';

function ErrorReporter({ onError, onRendered, root, code }) {
  const { error, element } = useContext(LiveContext);
  useEffect(() => {
    onError?.(error || null, code);
  }, [error, onError, code]);
  useEffect(() => {
    if (error || !element || !onRendered) return;
    let second;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => {
      if (!root.current?.firstElementChild?.childNodes.length) onError?.('The returned UI is empty. Try Regenerate.', code);
      else onRendered(root.current, code);
    }); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [element, error, code, root, onRendered, onError]);
  return error ? <pre className="m-render-error">{error}</pre> : null;
}

// Renders a source node's code live. data-misty-preview marks the drop surface.
export default function CodeRender({ nodeId, code, onError, onRendered }) {
  const root = useRef(null);
  const scope = useMemo(
    () => ({
      React,
      useState: React.useState,
      useEffect: React.useEffect,
      useRef: React.useRef,
      useMemo: React.useMemo,
      ...iconScope(code),
    }),
    [code]
  );

  // Rendered UIs are static here: keep links and forms from leaving the page.
  const stopNavigation = (event) => {
    if (event.target.closest?.('a') || event.type === 'submit') event.preventDefault();
  };

  return (
    <LiveProvider key={code} code={code} scope={scope}>
      <div
        className="m-screen nodrag nowheel nopan"
        ref={root}
        data-misty-preview={nodeId}
        onClickCapture={stopNavigation}
        onSubmitCapture={stopNavigation}
      >
        <LivePreview />
      </div>
      <ErrorReporter onError={onError} onRendered={onRendered} root={root} code={code} />
    </LiveProvider>
  );
}
