<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\ValidationException;

class BkashCheckBillRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'UserName' => 'required|string',
            'Password' => 'required|string',
            'CustomerNo' => 'required|string',
            'BillMonth' => 'required|string',
        ];
    }

    protected function failedValidation(Validator $validator)
    {
        $response = response()->json([
            'ErrorCode' => '406',
            'ErrorMsg' => 'Mandatory Field Missing: ' . implode(', ', $validator->errors()->all())
        ], 406);

        throw new ValidationException($validator, $response);
    }
}
