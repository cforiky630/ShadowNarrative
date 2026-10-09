# Shadow Narrative — Testing & Performance

## 1. Testing Layers

### Unit

测试：

- sampling
- particle mapping
- data transforms
- AI output validation
- API validation

### Component

测试：

- controls
- dialogs
- journal
- node interactions

### Integration

测试：

- upload → particle
- memory → theater
- conversation → journal
- persistence

### E2E

使用 Playwright 或等价工具。

## 2. Golden User Journey

```text
Create
→ upload photo
→ see particle
→ interact
→ switch photo
→ open memory
→ story
→ journal
→ conversation
→ save
→ reload
→ reopen
```

必须可完成。

## 3. Visual Regression

建议保留关键截图：

- Home idle
- Home hover
- Particle focus
- Morph mid-state
- Memory Field
- Theater
- Journal
- Conversation
- Mobile

目标不是像素级冻结所有 WebGL，而是防止明显视觉退化。

## 4. Performance Metrics

至少记录：

- FPS
- average frame time
- dropped frames
- particle count
- draw calls
- renderer pixel ratio
- texture memory（能获取时）
- initial load

## 5. Performance Goals

Desktop：

目标 60 FPS。

Mobile：

目标 30–60 FPS。

不是要求所有设备都达到相同数字。

## 6. Performance Degradation

超过目标时优先降低：

1. particle count
2. DPR
3. post-processing
4. noise frequency
5. render resolution

不要首先删除核心交互。

## 7. Browser Matrix

至少验证：

- Chrome
- Edge
- Safari（macOS/iOS，如条件允许）
- Firefox

## 8. Device Matrix

至少：

- high-end desktop
- normal laptop
- modern iPhone/Android
- low/medium mobile

## 9. Error Tests

测试：

- invalid image
- oversized image
- corrupted image
- WebGL unavailable
- slow network
- AI timeout
- AI invalid JSON
- storage failure
- database failure

## 10. Reduced Motion

启用系统 reduced motion 后：

- morph 降级
- camera 降级
- particle noise 降级
- 内容仍完整可用

## 11. Performance Rule

如果一个新视觉效果导致普通设备明显掉帧：

先优化，再上线。

## 12. No False Success

“开发服务器能启动”不等于完成。

“页面显示出来”不等于完成。

必须跑完整用户流程。
