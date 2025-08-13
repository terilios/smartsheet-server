# Pull Request

## Description

Brief description of what this PR does.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring (no functional changes)
- [ ] Test improvements
- [ ] CI/CD improvements

## Components Changed

- [ ] TypeScript MCP Server (`src/`)
- [ ] Python Operations (`smartsheet_ops/`)
- [ ] Healthcare Analytics
- [ ] Tests (TypeScript or Python)
- [ ] CI/CD Configuration
- [ ] Documentation
- [ ] Docker Configuration

## Testing

- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] I have tested this with both STDIO and HTTP transport modes (if applicable)
- [ ] I have tested with actual Smartsheet data (if applicable)

## Quality Checks

- [ ] My code follows the project's coding standards
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings or errors
- [ ] I have run the linter and formatter

### TypeScript (if applicable)
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run format` has been run
- [ ] `npm test` passes

### Python (if applicable)
- [ ] `black --check smartsheet_ops/` passes
- [ ] `flake8 smartsheet_ops/` passes
- [ ] `mypy smartsheet_ops/` passes (if applicable)
- [ ] `pytest` passes

## Security Considerations

- [ ] This change does not introduce any security vulnerabilities
- [ ] I have considered the impact on data privacy and API security
- [ ] Environment variables and secrets are properly handled
- [ ] Input validation is implemented where necessary

## Performance Impact

- [ ] This change does not negatively impact performance
- [ ] I have considered memory usage implications
- [ ] API rate limiting is respected
- [ ] Large datasets are handled efficiently

## Healthcare Data Considerations (if applicable)

- [ ] This change maintains HIPAA compliance considerations
- [ ] Patient data privacy is preserved
- [ ] Clinical data accuracy is maintained
- [ ] Audit trails are preserved

## Breaking Changes

If this is a breaking change, please describe the impact and migration path for existing users:

## Additional Notes

Add any additional notes, context, or screenshots that would be helpful for reviewers.

## Checklist for Reviewers

- [ ] Code quality and style
- [ ] Test coverage and quality
- [ ] Documentation accuracy
- [ ] Security implications
- [ ] Performance impact
- [ ] Breaking change assessment
- [ ] Healthcare compliance (if applicable)