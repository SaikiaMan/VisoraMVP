import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import gsap from 'gsap';

const Section = styled.section`
  background-color: #111010;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 100px 32px;
`;

const Container = styled.div`
  max-width: 1100px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;

  @media (max-width: 1099px) {
    max-width: 90vw;
  }
  @media (max-width: 599px) {
    max-width: 98vw;
  }
`;

const Label = styled.div`
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 18px;
  font-weight: 400;
  letter-spacing: 0.25em;
  line-height: 1.2;
  color: #A68EFF;
  text-transform: uppercase;
  margin-bottom: 32px;
  opacity: 0;

  @media (max-width: 1099px) {
    font-size: 14px;
    margin-bottom: 24px;
  }
  @media (max-width: 599px) {
    font-size: 12px;
    margin-bottom: 19px;
  }
`;

const Quote = styled.h2`
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 56px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.1;
  color: #FFFFFF;
  text-align: center;
  max-width: 900px;
  margin: 0 auto 64px auto;
  opacity: 0;

  @media (max-width: 1099px) {
    font-size: 36px;
    margin-bottom: 48px;
  }
  @media (max-width: 599px) {
    font-size: 24px;
    margin-bottom: 38px;
  }
`;

const UnderlineWrap = styled.span`
  position: relative;
  display: inline-block;
`;

const Underline = styled.span`
  position: absolute;
  bottom: -4px;
  left: 0;
  height: 2px;
  background-color: #A68EFF;
  width: 0%;
`;

const Divider = styled.div`
  width: 2px;
  height: 64px;
  background-color: #A68EFF;
  margin: 0 auto 64px auto;
  opacity: 0;
  transform-origin: top;

  @media (max-width: 1099px) {
    height: 48px;
    margin-bottom: 48px;
  }
  @media (max-width: 599px) {
    height: 38px;
    margin-bottom: 38px;
  }
`;

const Subtext = styled.p`
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 20px;
  font-weight: 400;
  font-style: italic;
  letter-spacing: 0;
  line-height: 1.4;
  color: #A0A0A0;
  max-width: 900px;
  margin: 0 auto;
  opacity: 0;

  @media (max-width: 1099px) {
    font-size: 16px;
  }
  @media (max-width: 599px) {
    font-size: 14px;
  }
`;

const PhilosophySection = () => {
  const sectionRef = useRef(null);
  const labelRef = useRef(null);
  const quoteRef = useRef(null);
  const underlinesRef = useRef([]);
  const dividerRef = useRef(null);
  const subtextRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const tl = gsap.timeline();

            tl.fromTo(labelRef.current,
              { opacity: 0, y: -24 },
              { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", delay: 0.1 }
            );

            tl.fromTo(quoteRef.current,
              { opacity: 0, y: 24 },
              { opacity: 1, y: 0, duration: 0.9, ease: "power2.out" },
              0.3
            );

            tl.to(underlinesRef.current,
              { width: "100%", duration: 0.7, ease: "power2.out", stagger: 0.15 },
              1.2
            );

            tl.fromTo(dividerRef.current,
              { opacity: 0, scaleY: 0 },
              { opacity: 1, scaleY: 1, duration: 0.7, ease: "power2.out", transformOrigin: "top" },
              1.2
            );

            tl.fromTo(subtextRef.current,
              { opacity: 0, y: 24 },
              { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" },
              1.5
            );

            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <Section ref={sectionRef}>
      <Container>
        <Label ref={labelRef}>THE PHILOSOPHY OF INTEGRATION</Label>
        <Quote ref={quoteRef}>
          'The greatest breakthroughs occur not when we replace humans with machines, but when we{' '}
          <UnderlineWrap>
            amplify human intent
            <Underline ref={(el) => (underlinesRef.current[0] = el)} />
          </UnderlineWrap>
          {' '}through the lens of{' '}
          <span style={{ whiteSpace: 'nowrap' }}>
            <UnderlineWrap>
              algorithmic perfection
              <Underline ref={(el) => (underlinesRef.current[1] = el)} />
            </UnderlineWrap>
            .'
          </span>
        </Quote>
        <Divider ref={dividerRef} />
        <Subtext ref={subtextRef}>
          We call this the 'Active Alliance'. A state of flow where the boundary between tool and creator dissolves, enabling feats of engineering and design previously thought impossible.
        </Subtext>
      </Container>
    </Section>
  );
};

export default PhilosophySection;
