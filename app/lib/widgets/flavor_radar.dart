import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/fish.dart';

/// A pentagon radar chart of a fish's flavour profile.
///
/// [axes] gives the ordered axes (from the dataset header) and [values]
/// maps each axis key to a 0-5 score.
class FlavorRadar extends StatelessWidget {
  const FlavorRadar({
    super.key,
    required this.axes,
    required this.values,
    required this.color,
    this.size = 220,
  });

  final List<FlavorAxis> axes;
  final Map<String, double> values;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _RadarPainter(
          axes: axes,
          values: values,
          color: color,
          gridColor: theme.colorScheme.outlineVariant,
          labelStyle: theme.textTheme.labelMedium!.copyWith(
            fontWeight: FontWeight.w700,
            color: theme.colorScheme.onSurface,
          ),
          valueStyle: theme.textTheme.labelSmall!.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _RadarPainter extends CustomPainter {
  _RadarPainter({
    required this.axes,
    required this.values,
    required this.color,
    required this.gridColor,
    required this.labelStyle,
    required this.valueStyle,
  });

  final List<FlavorAxis> axes;
  final Map<String, double> values;
  final Color color;
  final Color gridColor;
  final TextStyle labelStyle;
  final TextStyle valueStyle;

  static const _maxValue = 5.0;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    // Leave room for labels around the chart.
    final radius = math.min(size.width, size.height) / 2 - 26;
    final n = axes.length;
    if (n < 3) return;

    // Angle for axis i (start at top, clockwise).
    double angleFor(int i) => -math.pi / 2 + 2 * math.pi * i / n;

    Offset pointFor(int i, double r) => Offset(
          center.dx + r * math.cos(angleFor(i)),
          center.dy + r * math.sin(angleFor(i)),
        );

    final gridPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = gridColor;

    // Concentric rings (at 1..5).
    for (var ring = 1; ring <= 5; ring++) {
      final r = radius * ring / 5;
      final path = Path();
      for (var i = 0; i < n; i++) {
        final p = pointFor(i, r);
        if (i == 0) {
          path.moveTo(p.dx, p.dy);
        } else {
          path.lineTo(p.dx, p.dy);
        }
      }
      path.close();
      canvas.drawPath(path, gridPaint);
    }

    // Spokes.
    for (var i = 0; i < n; i++) {
      canvas.drawLine(center, pointFor(i, radius), gridPaint);
    }

    // Data polygon.
    final dataPath = Path();
    for (var i = 0; i < n; i++) {
      final v = (values[axes[i].key] ?? 0).clamp(0, _maxValue).toDouble();
      final p = pointFor(i, radius * v / _maxValue);
      if (i == 0) {
        dataPath.moveTo(p.dx, p.dy);
      } else {
        dataPath.lineTo(p.dx, p.dy);
      }
    }
    dataPath.close();

    canvas.drawPath(
      dataPath,
      Paint()
        ..style = PaintingStyle.fill
        ..color = color.withValues(alpha: 0.22),
    );
    canvas.drawPath(
      dataPath,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeJoin = StrokeJoin.round
        ..color = color,
    );

    // Vertex dots.
    for (var i = 0; i < n; i++) {
      final v = (values[axes[i].key] ?? 0).clamp(0, _maxValue).toDouble();
      canvas.drawCircle(
        pointFor(i, radius * v / _maxValue),
        3,
        Paint()..color = color,
      );
    }

    // Axis labels.
    for (var i = 0; i < n; i++) {
      final v = (values[axes[i].key] ?? 0).toDouble();
      final anchor = pointFor(i, radius + 16);
      final tp = TextPainter(
        text: TextSpan(
          children: [
            TextSpan(text: axes[i].label, style: labelStyle),
            TextSpan(text: '  ${v.toStringAsFixed(1)}', style: valueStyle),
          ],
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
      )..layout();
      tp.paint(
        canvas,
        Offset(anchor.dx - tp.width / 2, anchor.dy - tp.height / 2),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RadarPainter old) =>
      old.values != values || old.color != color;
}
