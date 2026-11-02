import React, { useContext, useEffect, useMemo } from 'react';
import { LiveContext, LivePreview, LiveProvider } from 'react-live';
import { iconScope } from '../lib/icons.js';
import { useMisty } from '../context.js';

function ErrorReporter({ onError }) {
  const { error } = useContext(LiveContext);
  useEffect(() => {
    onError?.(error || null);
  }, [error, onError]);
  return error ? <pre className="m-render-error">{error}</pre> : null;
}

// Renders a source node's code live. data-misty-preview marks the drop surface.
export default function CodeRender({ nodeId, code, onError }) {
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

  // In Touch mode a drag over the rendered UI pans the canvas, like anywhere else.
  const touchMode = useMisty()?.touchMode;

  return (
    <LiveProvider code={code} scope={scope}>
      <div
        className={`m-screen nodrag nowheel ${touchMode === 'touch' ? '' : 'nopan'}`}
        data-misty-preview={nodeId}
        onClickCapture={stopNavigation}
        onSubmitCapture={stopNavigation}
      >
        <LivePreview />
      </div>
      <ErrorReporter onError={onError} />
    </LiveProvider>
  );
}
