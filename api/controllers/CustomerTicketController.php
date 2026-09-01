<?php
class CustomerTicketController {
    private $request;
    private $db;
    private $masterDb;

    public function __construct(Request $request, PDO $tenantDb = null, PDO $masterDb = null) {
        $this->request = $request;
        $this->db = $tenantDb;
        $this->masterDb = $masterDb;
    }

    /**
     * 7. Create Support Ticket API
     * POST /api/v1/customer/ticket/create
     */
    public function createTicket() {
        $customer = $this->request->getCustomer();
        $body = $this->request->getJsonBody();

        $subject = trim($body['subject'] ?? '');
        $message = trim($body['message'] ?? '');
        $category = trim($body['category'] ?? 'technical');

        if ($message === '') {
            Response::fail(['message' => 'Message field is required'], 400, $this->request->getRequestId());
        }

        // Format message to combine subject (as tickets table lacks a subject column)
        $formattedMessage = $message;
        if ($subject !== '') {
            $formattedMessage = "Subject: " . $subject . "\n\n" . $message;
        }

        try {
            $stmt = $this->db->prepare("
                INSERT INTO tickets (client_id, category, message, status, created_at) 
                VALUES (?, ?, ?, 'Open', NOW())
            ");
            $stmt->execute([
                $customer['id'],
                $category,
                $formattedMessage
            ]);
            $ticketId = $this->db->lastInsertId();

            Response::success([
                'ticket_id' => (int)$ticketId,
                'status' => 'Open',
                'message' => 'Ticket created successfully',
                'created_at' => date('Y-m-d H:i:s')
            ], 201, $this->request->getRequestId());

        } catch (Exception $e) {
            Logger::error("Failed to create customer support ticket: " . $e->getMessage());
            Response::error('Failed to create ticket', 'TICKET_CREATION_FAILED', 500, $this->request->getRequestId());
        }
    }
}
