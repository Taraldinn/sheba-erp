<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;

class TicketApiController extends Controller
{
    /**
     * 7. Create Support Ticket API
     * POST /api/v1/customer/ticket/create
     */
    public function createTicket(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'subject' => 'nullable|string|max:200',
            'message' => 'required|string',
            'category' => 'nullable|string|in:technical,billing,general,other'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'fail',
                'data' => $validator->errors()
            ], 400);
        }

        $user = $request->user();
        $customerId = $user->id;

        $subject = trim($request->input('subject', ''));
        $message = trim($request->input('message'));
        $category = trim($request->input('category', 'technical'));

        // Format message to include subject in systems where the tickets table lacks a subject column
        $formattedMessage = $message;
        if ($subject !== '') {
            $formattedMessage = "Subject: " . $subject . "\n\n" . $message;
        }

        try {
            $ticketId = DB::connection('tenant')->table('tickets')->insertGetId([
                'client_id' => $customerId,
                'category' => $category,
                'message' => $formattedMessage,
                'status' => 'Open',
                'created_at' => now()
            ]);

            return response()->json([
                'status' => 'success',
                'data' => [
                    'ticket_id' => (int)$ticketId,
                    'status' => 'Open',
                    'message' => 'Ticket created successfully',
                    'created_at' => now()->toDateTimeString()
                ]
            ], 201);

        } catch (\Exception $e) {
            Log::error("Laravel mobile ticket creation failed: " . $e->getMessage());
            return response()->json([
                'status' => 'error',
                'message' => 'Failed to create support ticket'
            ], 500);
        }
    }
}
