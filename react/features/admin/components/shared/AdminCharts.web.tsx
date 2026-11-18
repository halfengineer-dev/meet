/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles, react/no-multi-comp */
import React, { useState } from 'react';

interface ISeriesPoint {
    label: string;
    secondary?: number;
    value: number;
}

export function AreaLineChart({
    data,
    primaryLabel = 'Count',
    secondaryLabel,
    color = '#2563eb',
    secondaryColor = '#6366f1',
    height = 200
}: {
    color?: string;
    data: ISeriesPoint[];
    height?: number;
    primaryLabel?: string;
    secondaryColor?: string;
    secondaryLabel?: string;
}) {
    const [ hoverIdx, setHoverIdx ] = useState<number | null>(null);

    if (!data || data.length === 0) {
        return <div className = 'fa-chart-empty'>No telemetry data recorded for this period.</div>;
    }

    const width = 560;
    const padX = 36;
    const padY = 20;
    const innerW = width - (padX * 2);
    const innerH = height - (padY * 2);
    const maxVal = Math.max(
        1,
        ...data.map(d => Math.max(d.value, d.secondary || 0))
    );

    const getX = (i: number) => (
        data.length === 1
            ? padX + (innerW / 2)
            : padX + ((i / (data.length - 1)) * innerW)
    );
    const getY = (v: number) => padY + innerH - ((v / maxVal) * innerH);

    const primaryPoints = data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' ');
    const areaPath = `M ${getX(0)},${padY + innerH} L ${data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' L ')} L ${getX(data.length - 1)},${padY + innerH} Z`;
    const secondaryPoints = secondaryLabel
        ? data.map((d, i) => `${getX(i)},${getY(d.secondary || 0)}`).join(' ')
        : null;

    const hovered = hoverIdx !== null ? data[hoverIdx] : null;

    return (
        <div className = 'fa-chart-wrap'>
            <svg
                className = 'fa-svg-chart'
                viewBox = { `0 0 ${width} ${height}` }>
                {[ 0, 0.25, 0.5, 0.75, 1 ].map((ratio, idx) => {
                    const y = padY + (innerH * ratio);
                    const tickVal = Math.round(maxVal * (1 - ratio));

                    return (
                        <g key = { idx }>
                            <line
                                className = 'fa-chart-grid'
                                x1 = { padX }
                                x2 = { width - padX }
                                y1 = { y }
                                y2 = { y } />
                            <text
                                className = 'fa-chart-axis'
                                textAnchor = 'end'
                                x = { padX - 8 }
                                y = { y + 4 }>
                                {tickVal}
                            </text>
                        </g>
                    );
                })}
                <path
                    d = { areaPath }
                    fill = { color }
                    fillOpacity = '0.09' />
                <polyline
                    fill = 'none'
                    points = { primaryPoints }
                    stroke = { color }
                    strokeLinejoin = 'round'
                    strokeWidth = '2.4' />
                {secondaryPoints && (
                    <polyline
                        fill = 'none'
                        points = { secondaryPoints }
                        stroke = { secondaryColor }
                        strokeDasharray = '4 3'
                        strokeLinejoin = 'round'
                        strokeWidth = '2' />
                )}
                {data.map((d, i) => (
                    <g key = { d.label }>
                        <circle
                            cx = { getX(i) }
                            cy = { getY(d.value) }
                            fill = { color }
                            r = { hoverIdx === i ? 5 : 3 } />
                        <rect
                            fill = 'transparent'
                            height = { innerH + padY }
                            onMouseEnter = { () => setHoverIdx(i) }
                            onMouseLeave = { () => setHoverIdx(null) }
                            width = { Math.max(16, innerW / Math.max(1, data.length)) }
                            x = { getX(i) - (Math.max(16, innerW / Math.max(1, data.length)) / 2) }
                            y = { 0 } />
                    </g>
                ))}
            </svg>
            <div className = 'fa-chart-footer'>
                <span>{data[0]?.label}</span>
                {hovered ? (
                    <span className = 'fa-chart-tooltip-inline'>
                        <strong>{hovered.label}</strong>: {primaryLabel} {hovered.value}
                        {secondaryLabel ? ` · ${secondaryLabel} ${hovered.secondary || 0}` : ''}
                    </span>
                ) : (
                    <span className = 'fa-chart-legend'>
                        <span
                            className = 'fa-dot'
                            style = {{ backgroundColor: color }} /> {primaryLabel}
                        {secondaryLabel && (
                            <>
                                {' '}
                                <span
                                    className = 'fa-dot'
                                    style = {{ backgroundColor: secondaryColor }} /> {secondaryLabel}
                            </>
                        )}
                    </span>
                )}
                <span>{data[data.length - 1]?.label}</span>
            </div>
        </div>
    );
}

export function HorizontalBarList({
    items,
    emptyText = 'No breakdown data available yet.'
}: {
    emptyText?: string;
    items: Array<{ count: number; label: string; sublabel?: string; }>;
}) {
    if (!items || items.length === 0) {
        return <div className = 'fa-chart-empty'>{emptyText}</div>;
    }

    const max = Math.max(1, ...items.map(i => i.count));

    return (
        <div className = 'fa-bar-list'>
            {items.map(item => (
                <div
                    className = 'fa-bar-row'
                    key = { item.label }>
                    <div className = 'fa-bar-meta'>
                        <span className = 'fa-bar-label'>{item.label}</span>
                        <span className = 'fa-bar-val'>
                            {item.count.toLocaleString()}
                            {item.sublabel ? ` · ${item.sublabel}` : ''}
                        </span>
                    </div>
                    <div className = 'fa-bar-track'>
                        <div
                            className = 'fa-bar-fill'
                            style = {{ width: `${Math.max(4, Math.round((item.count / max) * 100))}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function DonutBreakdown({
    segments
}: {
    segments: Array<{ color: string; label: string; value: number; }>;
}) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);

    if (total === 0) {
        return <div className = 'fa-chart-empty'>No records to visualize yet.</div>;
    }

    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    let cumulative = 0;

    return (
        <div className = 'fa-donut-wrap'>
            <svg
                height = '116'
                viewBox = '0 0 116 116'
                width = '116'>
                <circle
                    cx = '58'
                    cy = '58'
                    fill = 'none'
                    r = { radius }
                    stroke = 'var(--fa-border)'
                    strokeWidth = '14' />
                {segments.map(seg => {
                    const pct = seg.value / total;
                    const dash = pct * circumference;
                    const offset = -cumulative * circumference;

                    cumulative += pct;

                    return (
                        <circle
                            cx = '58'
                            cy = '58'
                            fill = 'none'
                            key = { seg.label }
                            r = { radius }
                            stroke = { seg.color }
                            strokeDasharray = { `${dash} ${circumference}` }
                            strokeDashoffset = { offset }
                            strokeWidth = '14'
                            transform = 'rotate(-90 58 58)' />
                    );
                })}
                <text
                    className = 'fa-donut-center'
                    dominantBaseline = 'middle'
                    textAnchor = 'middle'
                    x = '58'
                    y = '58'>
                    {total}
                </text>
            </svg>
            <div className = 'fa-donut-legend'>
                {segments.map(seg => (
                    <div
                        className = 'fa-donut-legend-row'
                        key = { seg.label }>
                        <span
                            className = 'fa-dot'
                            style = {{ backgroundColor: seg.color }} />
                        <span className = 'fa-donut-lbl'>{seg.label}</span>
                        <strong>{seg.value}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
}
