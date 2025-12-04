import React, { useEffect, useRef } from 'react';
import { ScriptWord } from '../types';

interface TeleprompterProps {
  words: ScriptWord[];
  activeWordIndex: number;
  fontSize: number;
  opacity: number;
}

const Teleprompter: React.FC<TeleprompterProps> = ({
  words,
  activeWordIndex,
  fontSize,
  opacity,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);

  // Auto-scroll to keep active word in view
  useEffect(() => {
    if (activeWordRef.current && containerRef.current) {
      activeWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
    }
  }, [activeWordIndex]);

  if (words.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/50 italic pointer-events-none text-2xl font-serif tracking-wide">
        Waiting for script...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-y-auto no-scrollbar px-8 py-32 pointer-events-none z-20 text-center"
      style={{
        // Subtle gradient to ensure text legibility against video
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.1) 100%)'
      }}
    >
      <div 
        className="max-w-4xl mx-auto leading-normal transition-all duration-300 ease-in-out font-serif"
        style={{ fontSize: `${fontSize}px` }}
      >
        {words.map((wordObj, index) => {
          // Words before the active index are "spoken" (Green)
          const isSpoken = index < activeWordIndex;
          const isActive = index === activeWordIndex;
          
          return (
            <React.Fragment key={wordObj.id}>
              {wordObj.isParagraphStart && (
                  // Spacer div to force a new line/paragraph visual break
                  <div className="w-full" style={{ height: '0.8em' }} aria-hidden="true" />
              )}
              <span
                ref={isActive ? activeWordRef : null}
                className={`
                  inline-block mx-1.5 my-1 transition-colors duration-200 rounded px-1
                  ${isSpoken ? 'text-green-400' : 'text-white'}
                `}
                style={{
                  textShadow: '0 2px 8px rgba(0,0,0,0.8)', // Strong shadow for contrast on video
                  opacity: isSpoken ? 1 : opacity // Apply user-defined opacity to future text
                }}
              >
                {wordObj.word}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default Teleprompter;