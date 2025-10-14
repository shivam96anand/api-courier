import { EditorType, RequestEditorValidatorConfig, ValidationResult } from '../../../types/request-types';

export class RequestEditorValidator {
  private validationResults: Map<EditorType, ValidationResult> = new Map();
  private onValidationChangeCallback: ((result: ValidationResult) => void) | null = null;

  constructor(private config: RequestEditorValidatorConfig) {}

  public validate(content: any, editorType: EditorType): ValidationResult {
    let result: ValidationResult = { isValid: true };

    try {
      switch (editorType) {
        case 'json':
          result = this.validateJson(content);
          break;
        case 'form-data':
          result = this.validateFormData(content);
          break;
        case 'x-www-form-urlencoded':
          result = this.validateUrlEncoded(content);
          break;
        case 'raw':
        case 'binary':
          result = { isValid: true }; // These don't need validation
          break;
        default:
          result = { isValid: true };
      }
    } catch (error) {
      result = {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }

    this.validationResults.set(editorType, result);

    if (this.config.validateOnChange) {
      this.onValidationChangeCallback?.(result);
    }

    return result;
  }

  private validateJson(content: any): ValidationResult {
    if (typeof content === 'string') {
      try {
        JSON.parse(content);
        return { isValid: true };
      } catch (error) {
        return {
          isValid: false,
          error: 'Invalid JSON syntax'
        };
      }
    }
    
    // If it's already an object, it's valid
    return { isValid: true };
  }

  private validateFormData(content: any): ValidationResult {
    if (!content || typeof content !== 'object') {
      return { isValid: true }; // Empty form data is valid
    }

    const warnings: string[] = [];
    
    // Check for duplicate keys
    const keys = Object.keys(content);
    const uniqueKeys = new Set(keys);
    if (keys.length !== uniqueKeys.size) {
      warnings.push('Duplicate keys detected in form data');
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  private validateUrlEncoded(content: any): ValidationResult {
    if (typeof content === 'string') {
      try {
        // Try to parse as URL encoded
        new URLSearchParams(content);
        return { isValid: true };
      } catch (error) {
        return {
          isValid: false,
          error: 'Invalid URL encoded format'
        };
      }
    }

    return { isValid: true };
  }

  public getValidationResult(editorType: EditorType): ValidationResult | undefined {
    return this.validationResults.get(editorType);
  }

  public clearValidation(editorType?: EditorType): void {
    if (editorType) {
      this.validationResults.delete(editorType);
    } else {
      this.validationResults.clear();
    }
  }

  public onValidationChange(callback: (result: ValidationResult) => void): void {
    this.onValidationChangeCallback = callback;
  }

  public destroy(): void {
    this.validationResults.clear();
    this.onValidationChangeCallback = null;
  }
}